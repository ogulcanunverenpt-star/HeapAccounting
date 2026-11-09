import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const dates = new Set(['qualified_at', 'created_at', 'started_at', 'completed_at', 'db_now', 'quote_at', 'executed_at']);
const json = new Set(['definition', 'answers']);

export async function createSqlitePool(filename) {
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    db.exec(await readFile(new URL('./sqlite-schema.sql', import.meta.url), 'utf8'));
  } catch (error) {
    db.close();
    throw error;
  }

  let tail = Promise.resolve();
  async function acquire() {
    let unlock;
    const previous = tail;
    tail = new Promise(resolve => { unlock = resolve; });
    await previous;
    return unlock;
  }

  function query(sql, params = []) {
    if (sql === 'BEGIN') { db.exec('BEGIN IMMEDIATE'); return { rows: [] }; }
    if (sql === 'COMMIT' || sql === 'ROLLBACK') { db.exec(sql); return { rows: [] }; }
    const statement = db.prepare(sql.replace(/\$(\d+)/g, '?$1'));
    const rows = statement.all(...params.map(value => value instanceof Date ? value.getTime() : value));
    return {
      rows: rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
        if (value !== null && dates.has(key)) return [key, new Date(value)];
        if (value !== null && json.has(key)) return [key, JSON.parse(value)];
        if (key === 'content' && value instanceof Uint8Array) return [key, Buffer.from(value)];
        return [key, value];
      }))),
    };
  }

  return {
    dialect: 'sqlite',
    async query(sql, params) {
      const release = await acquire();
      try { return query(sql, params); } finally { release(); }
    },
    async connect() {
      const unlock = await acquire();
      let released = false;
      return {
        async query(sql, params) { return query(sql, params); },
        release() { if (!released) { released = true; unlock(); } },
      };
    },
    async end() {
      const release = await acquire();
      try { db.close(); } finally { release(); }
    },
  };
}
