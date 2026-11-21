import Database from 'better-sqlite3';

export interface AllocatedReceiptBlock {
  blockId: string;
  deviceId: string;
  series: string;
  prefix: string;
  rangeStart: number;
  rangeEnd: number;
  allocatedAt?: string;
}

export interface IssuedReceiptNumber {
  receiptNo: string;
  isProvisional: boolean;
  blockId?: string;
  remainingInBlocks: number;
  needsRefill: boolean;
}

export interface ReceiptBlockStatus {
  remaining: number;
  needsRefill: boolean;
  refillThreshold: number;
  workstationCode: string;
  activeBlocks: number;
}

export const RECEIPT_BLOCK_SIZE = 100;
export const RECEIPT_REFILL_THRESHOLD = 30;

export function deriveWorkstationCode(deviceId: string): string {
  const cleaned = (deviceId || 'WS01').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return (cleaned.slice(-4) || 'WS01').padStart(4, '0');
}

export class ReceiptBlockManager {
  constructor(private db: Database.Database) {}

  public storeAllocatedBlock(schoolId: string, block: AllocatedReceiptBlock): void {
    this.db
      .prepare(`
        INSERT OR IGNORE INTO receipt_blocks (
          block_id, school_id, device_id, series, prefix,
          range_start, range_end, next_number, allocated_at, exhausted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `)
      .run(
        block.blockId,
        schoolId,
        block.deviceId,
        block.series || 'default',
        block.prefix || 'RCP',
        block.rangeStart,
        block.rangeEnd,
        block.rangeStart,
        block.allocatedAt || new Date().toISOString(),
      );
  }

  public getStatus(schoolId: string, deviceId: string, series = 'default'): ReceiptBlockStatus {
    const rows = this.db
      .prepare(`
        SELECT range_end, next_number
        FROM receipt_blocks
        WHERE school_id = ? AND device_id = ? AND series = ? AND exhausted = 0
      `)
      .all(schoolId, deviceId, series) as Array<{ range_end: number; next_number: number }>;

    let remaining = 0;
    for (const r of rows) {
      remaining += Math.max(0, r.range_end - r.next_number + 1);
    }

    return {
      remaining,
      needsRefill: remaining < RECEIPT_REFILL_THRESHOLD,
      refillThreshold: RECEIPT_REFILL_THRESHOLD,
      workstationCode: deriveWorkstationCode(deviceId),
      activeBlocks: rows.length,
    };
  }

  /**
   * Atomically issues the next receipt number from an allocated block of 100.
   * If all blocks are exhausted while offline, issues PROV-<workstationCode>-nnnn
   * and marks isProvisional = true so the server assigns an official number upon sync.
   */
  public issueNextReceiptNumber(schoolId: string, deviceId: string, series = 'default'): IssuedReceiptNumber {
    const tx = this.db.transaction((): IssuedReceiptNumber => {
      const active = this.db
        .prepare(`
          SELECT block_id, prefix, range_end, next_number
          FROM receipt_blocks
          WHERE school_id = ? AND device_id = ? AND series = ? AND exhausted = 0
          ORDER BY range_start ASC
          LIMIT 1
        `)
        .get(schoolId, deviceId, series) as
        | { block_id: string; prefix: string; range_end: number; next_number: number }
        | undefined;

      if (active && active.next_number <= active.range_end) {
        const assigned = active.next_number;
        const nextVal = assigned + 1;
        const exhausted = nextVal > active.range_end ? 1 : 0;

        this.db
          .prepare('UPDATE receipt_blocks SET next_number = ?, exhausted = ? WHERE block_id = ?')
          .run(nextVal, exhausted, active.block_id);

        const status = this.getStatus(schoolId, deviceId, series);
        const receiptNo = `${active.prefix}-${String(assigned).padStart(6, '0')}`;
        return {
          receiptNo,
          isProvisional: false,
          blockId: active.block_id,
          remainingInBlocks: status.remaining,
          needsRefill: status.needsRefill,
        };
      }

      // Block exhausted offline: issue PROV-<workstationCode>-nnnn
      const wsCode = deriveWorkstationCode(deviceId);
      this.db
        .prepare(`
          INSERT INTO provisional_receipt_seq (school_id, workstation_code, last_seq, updated_at)
          VALUES (?, ?, 1, datetime('now'))
          ON CONFLICT(school_id, workstation_code) DO UPDATE SET
            last_seq = last_seq + 1,
            updated_at = datetime('now')
        `)
        .run(schoolId, wsCode);

      const seqRow = this.db
        .prepare('SELECT last_seq FROM provisional_receipt_seq WHERE school_id = ? AND workstation_code = ?')
        .get(schoolId, wsCode) as { last_seq: number };

      const provNo = `PROV-${wsCode}-${String(seqRow.last_seq).padStart(4, '0')}`;
      return {
        receiptNo: provNo,
        isProvisional: true,
        remainingInBlocks: 0,
        needsRefill: true,
      };
    });

    return tx();
  }
}
