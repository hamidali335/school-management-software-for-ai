import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { getBetterSqliteNativeBinding } from '../native-binding';
import { DatabaseKeyManager } from '../../security/database-key-manager';

export interface SchoolSettingsRecord {
  schoolId: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  motto?: string | null;
  challanInstructions?: string | null;
  gradingSystem?: string | null;
  updatedAt?: string;
}

export class SettingsRepository {
  constructor(private db: Database.Database) {}

  public getSchoolSettings(schoolId: string): SchoolSettingsRecord {
    const row = this.db.prepare(`
      SELECT school_id as schoolId, contact_email as contactEmail, contact_phone as contactPhone,
             address, logo_url as logoUrl, motto, challan_instructions as challanInstructions,
             grading_system as gradingSystem, updated_at as updatedAt
      FROM school_settings
      WHERE school_id = ?
    `).get(schoolId) as SchoolSettingsRecord | undefined;

    if (!row) {
      // Default initial record
      return {
        schoolId,
        contactEmail: 'admin@schoolos.local',
        contactPhone: '+92 300 1234567',
        address: 'Main Campus, Pakistan',
        motto: 'Excellence in Education and Character Building',
        challanInstructions: '1. Please pay by the 10th of every month.\n2. Late fee of Rs. 100 applies after the due date.\n3. Keep bank stamped receipt safely.',
        gradingSystem: 'percentage',
      };
    }

    return row;
  }

  public updateSchoolSettings(schoolId: string, data: Partial<SchoolSettingsRecord>): SchoolSettingsRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO school_settings (
        id, school_id, contact_email, contact_phone, address, logo_url, motto,
        challan_instructions, grading_system, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        contact_email = excluded.contact_email,
        contact_phone = excluded.contact_phone,
        address = excluded.address,
        logo_url = excluded.logo_url,
        motto = excluded.motto,
        challan_instructions = excluded.challan_instructions,
        grading_system = excluded.grading_system,
        updated_at = excluded.updated_at
    `).run(
      schoolId,
      data.contactEmail || null,
      data.contactPhone || null,
      data.address || null,
      data.logoUrl || null,
      data.motto || null,
      data.challanInstructions || null,
      data.gradingSystem || 'percentage',
      now
    );

    return this.getSchoolSettings(schoolId);
  }

  public verifyDatabaseIntegrity(): { isHealthy: boolean; integrity: string; foreignKeyViolations: any[] } {
    const integrityRow = this.db.pragma('integrity_check') as any[];
    const integrity = integrityRow?.[0]?.integrity_check || 'ok';

    const fkRows = this.db.pragma('foreign_key_check') as any[];

    const isHealthy = integrity === 'ok' && fkRows.length === 0;
    return {
      isHealthy,
      integrity,
      foreignKeyViolations: fkRows,
    };
  }

  public async createVerifiedBackup(destinationDirectory?: string): Promise<{
    backupPath: string;
    timestamp: string;
    fileSizeBytes: number;
    verified: boolean;
    integrityStatus: string;
  }> {
    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-');
    const backupDir = destinationDirectory || path.resolve(process.cwd(), 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupFileName = `sms-backup-${timestampStr}.sqlite`;
    const backupFilePath = path.join(backupDir, backupFileName);

    // 1. Run live online backup via WAL checkpoint + VACUUM INTO (compatible with SQLCipher & plain SQLite)
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {}
    this.db.exec(`VACUUM INTO '${backupFilePath.replace(/'/g, "''")}'`);

    // 2. Physical verification: open the newly created backup file and run integrity checks
    let isPlaintextDb = false;
    try {
      const fd = fs.openSync(backupFilePath, 'r');
      const h = Buffer.alloc(16);
      fs.readSync(fd, h, 0, 16, 0);
      fs.closeSync(fd);
      if (h.toString('utf8', 0, 15) === 'SQLite format 3') {
        isPlaintextDb = true;
      }
    } catch {}

    const backupDb = new Database(backupFilePath, {
      readonly: true,
      nativeBinding: getBetterSqliteNativeBinding(),
    });
    try {
      if (!isPlaintextDb) {
        try {
          const keyManager = DatabaseKeyManager.getInstance();
          const keyHex = keyManager.getEncryptionKeyHex();
          backupDb.pragma("cipher = 'sqlcipher'");
          backupDb.pragma(`key = 'x''${keyHex}'''`);
        } catch {}
      }

      const integrityCheck = backupDb.pragma('integrity_check') as any[];
      const status = integrityCheck?.[0]?.integrity_check || 'unknown';
      const stats = fs.statSync(backupFilePath);

      if (status !== 'ok') {
        throw new Error(`Backup file integrity check failed with status: ${status}`);
      }

      return {
        backupPath: backupFilePath,
        timestamp: now.toISOString(),
        fileSizeBytes: stats.size,
        verified: true,
        integrityStatus: status,
      };
    } finally {
      backupDb.close();
    }
  }
}
