const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    label TEXT,
    age REAL,
    gender TEXT,
    gender_probability REAL,
    dominant_expression TEXT,
    expressions_json TEXT,
    face_shape TEXT,
    face_shape_confidence REAL,
    symmetry_score REAL,
    landmarks_count INTEGER,
    thumbnail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// --- lightweight auto-migration -------------------------------------------
// `CREATE TABLE IF NOT EXISTS` only applies to brand-new databases. If this
// file already existed from an earlier version of the app (e.g. before the
// `face_shape_confidence` or `role` columns existed), those columns would be
// silently missing and every insert referencing them would fail — which is
// exactly what breaks "save to history" after an update. This adds any
// columns the current schema expects but an older data.sqlite doesn't have.
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  const hasColumn = existing.some((col) => col.name === column);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('scans', 'face_shape_confidence', 'REAL');
ensureColumn('users', 'role', "TEXT NOT NULL DEFAULT 'user'");

// The very first account created on a fresh database becomes an admin, so
// there's always at least one way into /admin.html without manual SQL.
function promoteFirstUserToAdmin() {
  const hasAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (hasAdmin) return;
  const earliestUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
  if (earliestUser) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(earliestUser.id);
  }
}
promoteFirstUserToAdmin();

module.exports = db;
