// PostgreSQL connection (works with Neon, Supabase, Render Postgres, or a
// local Postgres). The connection string comes from DATABASE_URL.
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Add your Postgres connection string (for example from Neon) ' +
      'to backend/.env locally, or to the Environment Variables on Render.'
  );
}

// Hosted databases (Neon etc.) need SSL; a local Postgres usually does not.
// If the connection string itself contains ?sslmode=..., that takes priority.
const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

// Free hosted databases close idle connections. Without this handler that
// would crash the whole server with an unhandled 'error' event.
pool.on('error', (err) => {
  console.error('[db] idle connection error (will reconnect):', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

// Creates the tables on first run and makes sure an admin exists.
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT,
      age DOUBLE PRECISION,
      gender TEXT,
      gender_probability DOUBLE PRECISION,
      dominant_expression TEXT,
      expressions_json TEXT,
      face_shape TEXT,
      face_shape_confidence DOUBLE PRECISION,
      symmetry_score DOUBLE PRECISION,
      landmarks_count INTEGER,
      thumbnail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query('ALTER TABLE scans ADD COLUMN IF NOT EXISTS face_shape_scores TEXT');
  // client_id makes retries from the offline queue idempotent (no duplicates).
  await pool.query('ALTER TABLE scans ADD COLUMN IF NOT EXISTS client_id TEXT');
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_client ON scans (user_id, client_id) WHERE client_id IS NOT NULL'
  );
  await pool.query('CREATE INDEX IF NOT EXISTS idx_scans_user_created ON scans (user_id, created_at DESC)');

  // "Forgot password" requests. There is no email service, so a request just
  // shows up for the admin, who then hands the user a temporary password.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reset_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      handled_at TIMESTAMPTZ
    )
  `);
  // The person who asked gets a 6-digit request code. Later they can come back
  // with it to collect the temporary password the admin prepared for them.
  await pool.query('ALTER TABLE reset_requests ADD COLUMN IF NOT EXISTS pin_hash TEXT');
  await pool.query('ALTER TABLE reset_requests ADD COLUMN IF NOT EXISTS pin_attempts INTEGER NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE reset_requests ADD COLUMN IF NOT EXISTS delivered_password TEXT');
  await pool.query('ALTER TABLE reset_requests ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE reset_requests ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ');

  // Admin rules:
  //  - If ADMIN_EMAIL is set, only that email is an admin (recommended for a
  //    public website, so a stranger can't become admin by signing up first).
  //  - If it is not set, the very first account ever created becomes admin.
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail) {
    await pool.query("UPDATE users SET role = 'admin' WHERE lower(email) = $1", [adminEmail]);
    console.log(`[db] admin email configured: ${adminEmail}`);
  } else {
    const hasAdmin = await pool.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
    if (hasAdmin.rowCount === 0) {
      await pool.query(
        "UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)"
      );
    }
  }

  console.log('[db] connected to PostgreSQL and tables are ready');
}

module.exports = { pool, query, init };
