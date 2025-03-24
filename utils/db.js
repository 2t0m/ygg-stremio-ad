const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize the database
const dbPath = path.join(__dirname, '../data/streams.db');
const db = new sqlite3.Database(dbPath);

// Create the table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY,
      type TEXT,
      title TEXT,
      season TEXT,
      episode TEXT,
      streams TEXT
    )
  `);
});

// Ajouter la table TMDB cache
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tmdb_cache (
      imdb_id TEXT PRIMARY KEY,
      data TEXT
    )
  `);
});

// Ajouter la table YggAPI cache
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS ygg_cache (
      key TEXT PRIMARY KEY,
      data TEXT
    )
  `);
});

// Ajouter la table Magnet cache
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS magnet_cache (
      hash TEXT PRIMARY KEY,
      status TEXT,
      data TEXT
    )
  `);
});

// Ajouter la table Magnet Files cache
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS magnet_files_cache (
      hash TEXT PRIMARY KEY,
      files TEXT
    )
  `);
});

// Function to retrieve stored streams
function getStoredStreams(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT streams FROM streams WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      resolve(row ? JSON.parse(row.streams) : null);
    });
  });
}

// Function to store streams
function storeStreams(id, type, title, season, episode, streams) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO streams (id, type, title, season, episode, streams) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, type, title, season, episode, JSON.stringify(streams)],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

// Fonction pour récupérer les données TMDB mises en cache
function getCachedTmdb(imdbId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT data FROM tmdb_cache WHERE imdb_id = ?`, [imdbId], (err, row) => {
      if (err) return reject(err);
      resolve(row ? JSON.parse(row.data) : null);
    });
  });
}

// Fonction pour stocker les données TMDB dans le cache
function storeTmdb(imdbId, data) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO tmdb_cache (imdb_id, data) VALUES (?, ?)`,
      [imdbId, JSON.stringify(data)],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

// Fonction pour récupérer les données YggAPI mises en cache
function getCachedYgg(key) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT data FROM ygg_cache WHERE key = ?`, [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? JSON.parse(row.data) : null);
    });
  });
}

// Fonction pour stocker les données YggAPI dans le cache
function storeYgg(key, data) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO ygg_cache (key, data) VALUES (?, ?)`,
      [key, JSON.stringify(data)],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

// Fonction pour récupérer les données des magnets mises en cache
function getCachedMagnet(hash) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT data FROM magnet_cache WHERE hash = ?`, [hash], (err, row) => {
      if (err) return reject(err);
      resolve(row ? JSON.parse(row.data) : null);
    });
  });
}

// Fonction pour stocker les données des magnets dans le cache
function storeMagnet(hash, status, data) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO magnet_cache (hash, status, data) VALUES (?, ?, ?)`,
      [hash, status, JSON.stringify(data)],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

// Fonction pour récupérer les fichiers d'un magnet mis en cache
function getCachedMagnetFiles(hash) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT files FROM magnet_files_cache WHERE hash = ?`, [hash], (err, row) => {
      if (err) return reject(err);
      resolve(row ? JSON.parse(row.files) : null);
    });
  });
}

// Fonction pour stocker les fichiers d'un magnet dans le cache
function storeMagnetFiles(hash, files) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO magnet_files_cache (hash, files) VALUES (?, ?)`,
      [hash, JSON.stringify(files)],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

module.exports = {
  getStoredStreams,
  storeStreams,
  getCachedTmdb,
  storeTmdb,
  getCachedYgg,
  storeYgg,
  getCachedMagnet,
  storeMagnet,
  getCachedMagnetFiles,
  storeMagnetFiles
};