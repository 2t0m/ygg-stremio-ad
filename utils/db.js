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

// Create the table for stream cache if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS streams_cache (
      imdb_id TEXT,
      season TEXT,
      episode TEXT,
      streams_json TEXT,
      PRIMARY KEY (imdb_id, season, episode)
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

// Retrieve stream data from the cache
function getCachedStream(imdbId, season, episode) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT streams_json FROM streams_cache WHERE imdb_id = ? AND season = ? AND episode = ?`,
      [imdbId, season, episode],
      (err, row) => {
        if (err) return reject(err);
        if (row && row.streams_json) {
          try {
            resolve(JSON.parse(row.streams_json));
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      }
    );
  });
}

// Store stream data in the cache
function storeStream(imdbId, season, episode, streams) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO streams_cache (imdb_id, season, episode, streams_json) VALUES (?, ?, ?, ?)`,
      [imdbId, season, episode, JSON.stringify(streams)],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

module.exports = { db, getCachedTmdb, storeTmdb, getCachedStream, storeStream };
