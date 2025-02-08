const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const path = require('path');

// ------------------------------
// Fonctions utilitaires
// ------------------------------

// Formate une taille en GB
function formatSize(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb.toFixed(2) + " GB";
}

// Extrait résolution, codec et source depuis un nom de fichier
function parseFileName(fileName) {
  const resolutionMatch = fileName.match(/(4k|\d{3,4}p)/i);
  const codecMatch = fileName.match(/(h264|h265|x264|x265)/i);
  const sourceMatch = fileName.match(/(BluRay|WEB[-]?DL|WEL[-]?DL|WEB(?!-DL)|HDRip|DVDRip|BRRip)/i);
  return {
    resolution: resolutionMatch ? resolutionMatch[0] : "inconnue",
    codec: codecMatch ? codecMatch[0] : "inconnu",
    source: sourceMatch ? sourceMatch[0] : "inconnu"
  };
}

// ------------------------------
// Fonctions d'accès aux API externes
// ------------------------------

// Récupère les infos TMDB pour un imdbId
async function getTmdbData(imdbId, config) {
  try {
    console.log(`🔍 Récupération des infos TMDB pour l'IMDB ID: ${imdbId}`);
    const response = await axios.get(`https://api.themoviedb.org/3/find/${imdbId}`, {
      params: { api_key: config.TMDB_API_KEY, external_source: "imdb_id" }
    });
    if (response.data.movie_results && response.data.movie_results.length > 0) {
      console.log(`✅ Film trouvé: ${response.data.movie_results[0].title}`);
      return { type: "movie", title: response.data.movie_results[0].title };
    } else if (response.data.tv_results && response.data.tv_results.length > 0) {
      console.log(`✅ Série trouvée: ${response.data.tv_results[0].name}`);
      return { type: "series", title: response.data.tv_results[0].name };
    }
  } catch (error) {
    console.error("❌ Erreur TMDB:", error);
  }
  return null;
}

// Déverrouille un lien via AllDebrid
async function unlockFileLink(fileLink, config) {
  const url = "http://api.alldebrid.com/v4/link/unlock";
  const formData = new FormData();
  formData.append("link", fileLink);
  try {
    console.log(`🔄 Déverrouillage du lien: ${fileLink}`);
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });
    if (response.data.status === "success") {
      return response.data.data.link;
    } else {
      console.error("❌ Erreur déverrouillage:", response.data.data);
      return null;
    }
  } catch (error) {
    console.error("❌ Erreur déverrouillage:", error);
    return null;
  }
}

// Récupère les fichiers vidéo pour un magnet via AllDebrid
async function getFilesFromMagnetId(magnetId, config) {
  const url = `https://api.alldebrid.com/v4/magnet/files?apikey=${config.API_KEY_ALLEDBRID}`;
  const formData = new FormData();
  formData.append("id[]", magnetId);
  try {
    console.log(`🔄 Récupération des fichiers pour le magnet ID: ${magnetId}`);
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });
    if (response.data.status === "success") {
      let files = response.data.data.magnets[0].files;
      let videoFiles = [];
      files.forEach(file => {
        if (file.e && Array.isArray(file.e)) {
          videoFiles = videoFiles.concat(file.e);
        } else {
          videoFiles.push(file);
        }
      });
      const videoExtensions = [".mp4", ".mkv", ".avi", ".mov", ".wmv"];
      let filteredVideos = videoFiles.filter(file => {
        const fileName = file.n.toLowerCase();
        return videoExtensions.some(ext => fileName.endsWith(ext));
      });
      if (filteredVideos.length === 0 && videoFiles.length > 0) {
        filteredVideos = videoFiles;
      }
      console.log(`🎥 ${filteredVideos.length} vidéo(s) trouvée(s)`);
      return filteredVideos.map(file => ({
        name: file.n,
        size: file.s,
        link: file.l
      }));
    } else {
      console.error("❌ Erreur récupération fichiers:", response.data.data);
      return [];
    }
  } catch (error) {
    console.error("❌ Erreur récupération fichiers:", error);
    return [];
  }
}

// Récupère le hash d'un torrent sur YggTorrent
async function getTorrentHashFromYgg(torrentId) {
  const url = `https://yggapi.eu/torrent/${torrentId}`;
  try {
    console.log(`🔍 Récupération du hash pour le torrent ID: ${torrentId}`);
    const response = await axios.get(url);
    if (response.data && response.data.hash) {
      console.log(`✅ Hash récupéré: ${response.data.hash}`);
      return response.data.hash;
    }
  } catch (error) {
    console.error(`❌ Erreur récupération hash pour ${torrentId}:`, error);
    return null;
  }
  return null;
}

// Recherche de torrents sur YggTorrent
async function searchYgg(title, type, season, episode, config) {
  const requestUrl = `https://yggapi.eu/torrents?q=${encodeURIComponent(title)}&page=1&per_page=100&order_by=uploaded_at`;
  console.log(`🔍 Recherche YggTorrent pour ${title} (${type})`);
  try {
    const response = await axios.get(requestUrl);
    let torrents = response.data || [];
    torrents.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
    let selectedTorrents = [];
    if (type === "series" && season && episode) {
      const seasonFormatted = season.padStart(2, '0');
      const episodeFormatted = episode.padStart(2, '0');
      let completeSeasonTorrents = torrents.filter(torrent =>
        config.RES_TO_SHOW.some(res => torrent.title.includes(res)) &&
        config.LANG_TO_SHOW.some(lang => torrent.title.includes(lang)) &&
        torrent.title.includes(`S${seasonFormatted}`) &&
        !torrent.title.match(new RegExp(`S${seasonFormatted}E\\d{2}`, "i"))
      );
      if (completeSeasonTorrents.length > 0) {
        console.log(`🔎 Torrent de saison complète trouvé pour S${seasonFormatted}`);
        for (let torrent of completeSeasonTorrents.slice(0, config.FILES_TO_SHOW)) {
          const hash = await getTorrentHashFromYgg(torrent.id);
          if (hash) {
            console.log(`${torrent.title} | Seeders: ${torrent.seeders} | Hash: ${hash}`);
            selectedTorrents.push({ hash, completeSeason: true });
          } else {
            console.log(`❌ Pas de hash pour ${torrent.title}`);
          }
        }
      } else {
        let episodeTorrents = torrents.filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.title.includes(res)) &&
          config.LANG_TO_SHOW.some(lang => torrent.title.includes(lang)) &&
          torrent.title.includes(`S${seasonFormatted}E${episodeFormatted}`)
        );
        console.log(`🔎 Filtrage pour l'épisode S${seasonFormatted}E${episodeFormatted}`);
        for (let torrent of episodeTorrents.slice(0, config.FILES_TO_SHOW)) {
          const hash = await getTorrentHashFromYgg(torrent.id);
          if (hash) {
            console.log(`${torrent.title} | Seeders: ${torrent.seeders} | Hash: ${hash}`);
            selectedTorrents.push({ hash, completeSeason: false });
          } else {
            console.log(`❌ Pas de hash pour ${torrent.title}`);
          }
        }
      }
    } else {
      let filmTorrents = torrents.filter(torrent =>
        config.RES_TO_SHOW.some(res => torrent.title.includes(res)) &&
        config.LANG_TO_SHOW.some(lang => torrent.title.includes(lang))
      );
      console.log("🔎 Filtrage pour film (résolution et langue)");
      for (let torrent of filmTorrents.slice(0, config.FILES_TO_SHOW)) {
        const hash = await getTorrentHashFromYgg(torrent.id);
        if (hash) {
          console.log(`${torrent.title} | Seeders: ${torrent.seeders} | Hash: ${hash}`);
          selectedTorrents.push({ hash, completeSeason: false });
        } else {
          console.log(`❌ Pas de hash pour ${torrent.title}`);
        }
      }
    }
    if (selectedTorrents.length > 0) {
      console.log(`🎬 ${selectedTorrents.length} torrent(s) sélectionné(s) pour ${title} (${type}).`);
      return selectedTorrents;
    } else {
      console.log(`❌ Aucun torrent filtré trouvé pour ${title} (${type}).`);
      return [];
    }
  } catch (error) {
    console.error("❌ Erreur recherche Ygg:", error);
    return [];
  }
}

// Upload des magnets via AllDebrid
async function uploadMagnets(magnets, config) {
  const url = "https://api.alldebrid.com/v4/magnet/upload?apikey=" + config.API_KEY_ALLEDBRID;
  const formData = new FormData();
  magnets.forEach(m => formData.append("magnets[]", m.hash));
  try {
    console.log("🔄 Upload des magnets à AllDebrid...");
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });
    if (response.data.status === "success") {
      return response.data.data.magnets.map(magnetData => ({
        hash: magnetData.hash,
        ready: magnetData.ready ? '✅ Prêt' : '❌ Pas prêt',
        name: magnetData.name,
        size: magnetData.size,
        id: magnetData.id
      }));
    } else {
      console.error("❌ Erreur upload magnets:", response.data.data);
      return [];
    }
  } catch (error) {
    console.error("❌ Erreur envoi magnets:", error);
    return [];
  }
}

// ------------------------------
// Configuration du serveur (toujours avec encodedConfig)
// ------------------------------

const app = express();
const PORT = process.env.PORT || 5005;

// Middleware CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Middleware de log
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Redirige la racine "/" vers "/config"
app.get('/', (req, res) => {
    res.redirect('/config');
  });

// La configuration doit toujours être fournie via la partie "variables" de l'URL.
// Si elle est absente ou invalide, une erreur est renvoyée.
function getConfig(req) {
  if (req.params.variables) {
    try {
      const decoded = Buffer.from(req.params.variables, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (e) {
      throw new Error("Configuration invalide dans l'URL");
    }
  } else {
    throw new Error("Configuration absente dans l'URL");
  }
}

// Route pour servir la page de configuration
app.get('/config', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
});

/*
  Endpoint du manifest
  Les chemins possibles :
    - /:variables/manifest.json (la configuration encodée doit être présente)
*/
app.get('/:variables/manifest.json', (req, res) => {
  let config;
  try {
    config = getConfig(req);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Manifest statique (peut être adapté dynamiquement si besoin)
  const manifest = {
    id: 'ygg.stremio.ad',
    version: '0.0.1',
    name: 'Ygg + AD',
    description: 'Un addon pour accéder aux torrents YggTorrent en cache sur AllDebrid (grâce à Ygg API).',
    types: ['movie', 'series'],
    resources: ['stream'],
    catalogs: []
  };
  res.json(manifest);
});

/*
  Endpoint du stream
  Chemins possibles :
    - /:variables/stream/:type/:id.json (la configuration encodée doit être présente dans l'URL)
*/
app.get('/:variables/stream/:type/:id.json', async (req, res) => {
  let config;
  try {
    config = getConfig(req);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const { type, id } = req.params;
  console.log("==============================================");
  console.log(`📥 Requête stream reçue pour l'ID: ${id}`);
  const parts = id.split(':');
  const imdbId = parts[0];
  const season = parts[1];
  const episode = parts[2];
  const tmdbData = await getTmdbData(imdbId, config);
  if (!tmdbData) {
    console.log(`❌ Impossible de récupérer les infos TMDB pour ${imdbId}`);
    return res.json({ streams: [] });
  }
  console.log(`✅ Contenu identifié: ${tmdbData.title} (${tmdbData.type})`);
  let magnets = [];
  if (tmdbData.type === "series") {
    if (!season || !episode) {
      console.error("❌ Pour une série, saison et épisode sont requis.");
      return res.json({ streams: [] });
    }
    console.log(`📺 Recherche pour la série - S${season}E${episode}`);
    magnets = await searchYgg(tmdbData.title, tmdbData.type, season, episode, config);
  } else if (tmdbData.type === "movie") {
    console.log("🎬 Recherche pour le film");
    magnets = await searchYgg(tmdbData.title, tmdbData.type, null, null, config);
  } else {
    console.error("❌ Type de contenu non supporté:", tmdbData.type);
    return res.json({ streams: [] });
  }
  if (!magnets || magnets.length === 0) {
    console.log("❌ Aucun magnet trouvé pour", tmdbData.title);
    return res.json({ streams: [] });
  }
  const completeMapping = {};
  magnets.forEach(m => completeMapping[m.hash] = m.completeSeason);
  const filesStatus = await uploadMagnets(magnets, config);
  let streams = [];
  let episodePattern;
  if (tmdbData.type === "series") {
    const seasonFormatted = season.padStart(2, '0');
    const episodeFormatted = episode.padStart(2, '0');
    episodePattern = new RegExp(`S${seasonFormatted}E${episodeFormatted}`, "i");
  }
  for (const fileStatus of filesStatus) {
    console.log(`🔎 Vérification du magnet "${fileStatus.name}" - Statut: ${fileStatus.ready}`);
    if (fileStatus.ready === '✅ Prêt') {
      let videoFiles = await getFilesFromMagnetId(fileStatus.id, config);
      if (tmdbData.type === "series" && completeMapping[fileStatus.hash]) {
        videoFiles = videoFiles.filter(file => file.name.match(episodePattern));
      }
      for (const file of videoFiles) {
        console.log(`🔄 Tentative de déverrouillage du fichier: ${file.name}`);
        const unlockedLink = await unlockFileLink(file.link, config);
        if (unlockedLink) {
          const { resolution, codec, source } = parseFileName(file.name);
          const titlePrefix = "⚡ ";
          streams.push({
            title: `${titlePrefix}${tmdbData.title} ${tmdbData.type === "series" ? `- S${season.padStart(2, '0')}E${episode.padStart(2, '0')}` : ""}\n` +
                   `${file.name}\n` +
                   `📏 ${resolution} | 💿 ${codec}\n` +
                   `🎬 ${source} | 💾 ${formatSize(file.size)}`,
            url: unlockedLink,
            behaviorHints: {
              bingeGroup: `${tmdbData.title}${tmdbData.type === "series" ? `-S${season.padStart(2, '0')}` : ""}`,
              notWebReady: false,
              betterResolution: file.size > 4 ? true : false
            }
          });
          console.log(`✅ Lien déverrouillé: ${unlockedLink}`);
        } else {
          console.log(`❌ Échec pour le fichier: ${file.name}`);
        }
      }
    } else {
      console.log(`❌ Le magnet "${fileStatus.name}" n'est pas prêt.`);
    }
  }
  console.log(`🎉 ${streams.length} stream(s) obtenus`);
  return res.json({ streams: streams.slice(0, config.FILES_TO_SHOW) });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
