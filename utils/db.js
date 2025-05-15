const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize the database
const db = new sqlite3.Database(path.join('/data', 'streams.db'));

// Create the table for TMDB cache if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tmdb_cache (
      imdb_id TEXT PRIMARY KEY,
      type TEXT,
      title TEXT,
      french_title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Retrieve TMDB data from the cache
function getCachedTmdb(imdbId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT type, title, french_title FROM tmdb_cache WHERE imdb_id = ?`,
      [imdbId],
      (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row || null);
      }
    );
  });
}

// Store TMDB data in the cache
function storeTmdb(imdbId, type, title, frenchTitle) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO tmdb_cache (imdb_id, type, title, french_title) VALUES (?, ?, ?, ?)`,
      [imdbId, type, title, frenchTitle],
      function (err) {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

module.exports = { db, getCachedTmdb, storeTmdb };
