const { Pool } = require('pg');

// Render-এর এনভায়রনমেন্ট ভেরিয়েবল থেকে DATABASE_URL লিংকটি অটোমেটিক রিড করবে
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
