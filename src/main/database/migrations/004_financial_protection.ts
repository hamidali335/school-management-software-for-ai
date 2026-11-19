import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration004FinancialProtection: Migration = {
  version: 4,
  name: '004_financial_protection',
  up: (db: Database.Database) => {
    // 1. Add cancellation metadata columns to invoices if not already present
    const invoiceCols = db.pragma('table_info(invoices)') as { name: string }[];
    const colNames = new Set(invoiceCols.map(c => c.name));

    if (!colNames.has('is_cancelled')) {
      db.exec('ALTER TABLE invoices ADD COLUMN is_cancelled INTEGER DEFAULT 0;');
    }
    if (!colNames.has('cancelled_at')) {
      db.exec('ALTER TABLE invoices ADD COLUMN cancelled_at TEXT;');
    }
    if (!colNames.has('cancellation_reason')) {
      db.exec('ALTER TABLE invoices ADD COLUMN cancellation_reason TEXT;');
    }

    // 2. Database-level triggers for strict financial immutability and anti-cascade protection
    db.exec(`
      -- Context table for server tombstone application
      CREATE TABLE IF NOT EXISTS sync_apply_context (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        applying_server_tombstone INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO sync_apply_context (id, applying_server_tombstone) VALUES (1, 0);

      -- A. Enforce ON DELETE RESTRICT on classes(id) so classes with sections cannot be cascade deleted
      CREATE TRIGGER IF NOT EXISTS trg_prevent_class_deletion_with_sections
      BEFORE DELETE ON classes
      WHEN (SELECT COUNT(*) FROM sections WHERE class_id = OLD.id) > 0
      BEGIN
        SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed: Cannot delete class with associated sections');
      END;

      -- B. Never permit physical deletion of payment receipts (including reversed contra-entries) unless applying server tombstone
      CREATE TRIGGER IF NOT EXISTS trg_prevent_payment_deletion
      BEFORE DELETE ON payments
      WHEN (SELECT COALESCE(applying_server_tombstone, 0) FROM sync_apply_context WHERE id = 1) = 0
      BEGIN
        SELECT RAISE(ABORT, 'Financial records are immutable: physical deletion of payment receipts is forbidden');
      END;

      -- C. Never permit deletion of an invoice that has associated payment receipts unless applying server tombstone
      CREATE TRIGGER IF NOT EXISTS trg_prevent_invoice_deletion_with_payments
      BEFORE DELETE ON invoices
      WHEN (SELECT COALESCE(applying_server_tombstone, 0) FROM sync_apply_context WHERE id = 1) = 0
        AND (SELECT COUNT(*) FROM payments WHERE invoice_id = OLD.id) > 0
      BEGIN
        SELECT RAISE(ABORT, 'Cannot delete fee invoice: associated payment history exists');
      END;

      -- D. Never permit deletion of a student record if historical invoices exist unless applying server tombstone
      CREATE TRIGGER IF NOT EXISTS trg_prevent_student_deletion_with_financials
      BEFORE DELETE ON students
      WHEN (SELECT COALESCE(applying_server_tombstone, 0) FROM sync_apply_context WHERE id = 1) = 0
        AND (SELECT COUNT(*) FROM invoices WHERE student_id = OLD.id) > 0
      BEGIN
        SELECT RAISE(ABORT, 'Cannot delete student: associated financial invoices and payment records exist. Use student status archival (inactive/withdrawn/graduated) instead.');
      END;

      -- E. Never permit deletion of an academic session if fee invoices exist
      CREATE TRIGGER IF NOT EXISTS trg_prevent_session_deletion_with_financials
      BEFORE DELETE ON academic_sessions
      WHEN (SELECT COUNT(*) FROM invoices WHERE session_id = OLD.id) > 0
      BEGIN
        SELECT RAISE(ABORT, 'Cannot delete academic session: associated fee invoices and financial records exist');
      END;
    `);
  },
};
