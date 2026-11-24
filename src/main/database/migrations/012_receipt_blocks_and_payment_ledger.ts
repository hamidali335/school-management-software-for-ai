import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export const migration012ReceiptBlocksAndPaymentLedger: Migration = {
  version: 12,
  name: '012_receipt_blocks_and_payment_ledger',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS receipt_blocks (
        block_id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        series TEXT NOT NULL DEFAULT 'default',
        prefix TEXT NOT NULL DEFAULT 'RCP',
        range_start INTEGER NOT NULL,
        range_end INTEGER NOT NULL,
        next_number INTEGER NOT NULL,
        allocated_at TEXT NOT NULL DEFAULT (datetime('now')),
        exhausted INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_receipt_blocks_active
        ON receipt_blocks(school_id, device_id, series, exhausted, range_start);

      CREATE TABLE IF NOT EXISTS provisional_receipt_seq (
        school_id TEXT NOT NULL,
        workstation_code TEXT NOT NULL,
        last_seq INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (school_id, workstation_code)
      );
    `);

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(
      (t) => t.name,
    );

    const paymentTable = tables.includes('payments') ? 'payments' : tables.includes('fee_payments') ? 'fee_payments' : null;
    if (paymentTable) {
      addColumnIfMissing(db, paymentTable, 'transaction_id', 'TEXT');
      addColumnIfMissing(db, paymentTable, 'entry_type', "TEXT NOT NULL DEFAULT 'payment'");
      addColumnIfMissing(db, paymentTable, 'original_payment_id', 'TEXT');
      addColumnIfMissing(db, paymentTable, 'provisional_receipt_no', 'TEXT');
      addColumnIfMissing(db, paymentTable, 'official_receipt_no', 'TEXT');
      addColumnIfMissing(db, paymentTable, 'is_provisional', 'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(db, paymentTable, 'sync_status', "TEXT NOT NULL DEFAULT 'pending'");
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_${paymentTable}_transaction_id
          ON ${paymentTable}(school_id, transaction_id)
          WHERE transaction_id IS NOT NULL;
      `);
    }

    const invoiceTable = tables.includes('invoices') ? 'invoices' : tables.includes('fee_invoices') ? 'fee_invoices' : null;
    if (invoiceTable) {
      addColumnIfMissing(db, invoiceTable, 'overpaid', 'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(db, invoiceTable, 'overpaid_amount', 'REAL NOT NULL DEFAULT 0');
    }
  },
  down(db: Database.Database) {
    db.exec(`
      DROP TABLE IF EXISTS receipt_blocks;
      DROP TABLE IF EXISTS provisional_receipt_seq;
    `);
  },
};
