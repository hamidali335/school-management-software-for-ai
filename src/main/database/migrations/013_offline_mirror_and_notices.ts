import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration013OfflineMirrorAndNotices: Migration = {
  version: 13,
  name: '013_offline_mirror_and_notices',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS offline_mirror_cache (
        school_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        seq INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (school_id, entity_type, entity_id)
      );

      CREATE INDEX IF NOT EXISTS idx_offline_mirror_school_entity
        ON offline_mirror_cache(school_id, entity_type);

      CREATE TABLE IF NOT EXISTS notices_cache (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        audience_roles TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'published',
        published_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_notices_cache_school
        ON notices_cache(school_id, created_at DESC);
    `);
  },
  down(db: Database.Database) {
    db.exec(`
      DROP TABLE IF EXISTS offline_mirror_cache;
      DROP TABLE IF EXISTS notices_cache;
    `);
  },
};
