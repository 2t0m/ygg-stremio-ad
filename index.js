const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const path = require('path');
const https = require('https');
const fs = require('fs');

// ------------------------------
// Utility Functions
// ------------------------------

// Format size in GB
function formatSize(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb.toFixed(2) + " GB";
}

// Extract resolution, codec, and source from a file name
function parseFileName(fileName) {
  const resolutionMatch = fileName.match(/(4k|\d{3,4}p)/i);
  const codecMatch = fileName.match(/(h264|h265|x264|x265|AV1)/i);
  const sourceMatch = fileName.match(/(BluRay|WEB[-]?DL|WEL[-]?DL|WEB(?!-DL)|HDRip|DVDRip|BRRip)/i);
  return {
    resolution: resolutionMatch ? resolutionMatch[0] : "unknown",
    codec: codecMatch ? codecMatch[0] : "unknown",
    source: sourceMatch ? sourceMatch[0] : "unknown"
  };
}

// ------------------------------
// External API Functions
// ------------------------------

// Retrieve TMDB info for an imdbId
async function getTmdbData(imdbId, config) {
  try {
    console.log(`🔍 Retrieving TMDB info for IMDB ID: ${imdbId}`);
    const response = await axios.get(`https://api.themoviedb.org/3/find/${imdbId}`, {
      params: { api_key: config.TMDB_API_KEY, external_source: "imdb_id" }
    });

    if (response.data.movie_results?.length > 0) {
      const title = response.data.movie_results[0].title;
      const frenchTitle = response.data.movie_results[0].original_title;
      console.log(`✅ Movie found: ${title} (FR Title: ${frenchTitle})`);
      return { type: "movie", title, frenchTitle };
    } else if (response.data.tv_results?.length > 0) {
      const title = response.data.tv_results[0].name;
      const frenchTitle = response.data.tv_results[0].original_name;
      console.log(`✅ Series found: ${title} (FR Title: ${frenchTitle})`);
      return { type: "series", title, frenchTitle };
    }
  } catch (error) {
    console.error("❌ TMDB Error:", error);
  }
  return null;
}

// Retrieve the hash of a torrent on YggTorrent
async function getTorrentHashFromYgg(torrentId) {
  const url = `https://yggapi.eu/torrent/${torrentId}`;
  try {
    console.log(`🔍 Retrieving hash for torrent ID: ${torrentId}`);
    const response = await axios.get(url);
    if (response.data && response.data.hash) {
      console.log(`✅ Hash retrieved: ${response.data.hash}`);
      return response.data.hash;
    }
  } catch (error) {
    console.error(`❌ Hash Retrieval Error for ${torrentId}:`, error);
    return null;
  }
  return null;
}

// Search for torrents on YggTorrent
async function searchYgg(title, type, season, episode, config, titleFR = null) {
  async function performSearch(searchTitle) {
    console.log(`🔍 Searching YggTorrent for ${searchTitle} (${type})`);
    const requestUrl = `https://yggapi.eu/torrents?q=${encodeURIComponent(searchTitle)}&page=1&per_page=100&order_by=uploaded_at`;
    try {
      const response = await axios.get(requestUrl);
      let torrents = response.data || [];
      torrents.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

      // Prioritize languages, resolutions, and codecs
      const prioritize = (torrent, priorities) => {
        for (let i = 0; i < priorities.length; i++) {
          if (torrent.title.includes(priorities[i])) {
            return i;
          }
        }
        return priorities.length;
      };

      torrents.sort((a, b) => {
        const langPriorityA = prioritize(a, config.LANG_TO_SHOW);
        const langPriorityB = prioritize(b, config.LANG_TO_SHOW);
        if (langPriorityA !== langPriorityB) {
          return langPriorityA - langPriorityB;
        }
        const resPriorityA = prioritize(a, config.RES_TO_SHOW);
        const resPriorityB = prioritize(b, config.RES_TO_SHOW);
        if (resPriorityA !== resPriorityB) {
          return resPriorityA - resPriorityB;
        }
        const codecPriorityA = prioritize(a, config.CODECS_TO_SHOW);
        const codecPriorityB = prioritize(b, config.CODECS_TO_SHOW);
        return codecPriorityA - codecPriorityB;
      });

      let selectedTorrents = [];

      if (type === "series" && season && episode) {
        const seasonFormatted = season.padStart(2, '0');
        const episodeFormatted = episode.padStart(2, '0');

        // Search for a complete season
        let completeSeasonTorrents = torrents.filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.title.includes(res)) &&
          config.LANG_TO_SHOW.some(lang => torrent.title.includes(lang)) &&
          config.CODECS_TO_SHOW.some(codec => torrent.title.includes(codec)) &&
          torrent.title.includes(`S${seasonFormatted}`) &&
          !torrent.title.match(new RegExp(`S${seasonFormatted}E\\d{2}`, "i"))
        );

        // Search for complete series with the word "COMPLETE"
        let completeSeriesTorrents = torrents.filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.title.includes(res)) &&
          config.LANG_TO_SHOW.some(lang => torrent.title.includes(lang)) &&
          config.CODECS_TO_SHOW.some(codec => torrent.title.includes(codec)) &&
          torrent.title.toUpperCase().includes("COMPLETE")
        );

        // If a complete season is found, add them
        if (completeSeasonTorrents.length > 0) {
          console.log(`🔎 Complete season found for S${seasonFormatted}`);
          for (let torrent of completeSeasonTorrents.slice(0, config.FILES_TO_SHOW)) {
            const hash = await getTorrentHashFromYgg(torrent.id);
            if (hash) {
              console.log(`${torrent.title} | Seeders: ${torrent.seeders} | Hash: ${hash}`);
              selectedTorrents.push({ hash, completeSeason: true });
            } else {
              console.log(`❌ No hash for ${torrent.title}`);
            }
          }
        } else {
          // Search for the specific episode
          let episodeTorrents = torrents.filter(torrent =>
            config.RES_TO_SHOW.some(res => torrent.title.includes(res)) &&
            config.LANG_TO_SHOW.some(lang => torrent.title.includes(lang)) &&
            config.CODECS_TO_SHOW.some(codec => torrent.title.includes(codec)) &&
            torrent.title.includes(`S${seasonFormatted}E${episodeFormatted}`)
          );

          console.log(`🔎 Filtering for episode S${seasonFormatted}E${episodeFormatted}`);
          for (let torrent of episodeTorrents.slice(0, config.FILES_TO_SHOW)) {
            const hash = await getTorrentHashFromYgg(torrent.id);
            if (hash) {
              console.log(`${torrent.title} | Seeders: ${torrent.seeders} | Hash: ${hash}`);
              selectedTorrents.push({ hash, completeSeason: false });
            } else {
              console.log(`❌ No hash for ${torrent.title}`);
            }
          }
        }

        // If complete series are found, add them too
        if (completeSeriesTorrents.length > 0) {
          console.log(`🔎 Complete series found`);
          for (let torrent of completeSeriesTorrents.slice(0, config.FILES_TO_SHOW)) {
            const hash = await getTorrentHashFromYgg(torrent.id);
            if (hash) {
              console.log(`${torrent.title} | Seeders: ${torrent.seeders} | Hash: ${hash}`);
              selectedTorrents.push({ hash, completeSeason: true });
            } else {
              console.log(`❌ No hash for ${torrent.title}`);
            }
          }
        }
      } else {
        // Search for a movie
        let filmTorrents = torrents.filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.title.includes(res)) &&
          config.LANG_TO_SHOW.some(lang => torrent.title.includes(lang)) &&
          config.CODECS_TO_SHOW.some(codec => torrent.title.includes(codec))
        );

        console.log("🔎 Filtering for movie (resolution, language, and codec)");
        for (let torrent of filmTorrents.slice(0, config.FILES_TO_SHOW)) {
          const hash = await getTorrentHashFromYgg(torrent.id);
          if (hash) {
            console.log(`${torrent.title} | Seeders: ${torrent.seeders} | Hash: ${hash}`);
            selectedTorrents.push({ hash, completeSeason: false });
          } else {
            console.log(`❌ No hash for ${torrent.title}`);
          }
        }
      }

      return selectedTorrents;
    } catch (error) {
      console.error("❌ Ygg Search Error:", error);
      return [];
    }
  }

  // 🔍 Initial search with the original title
  let torrents = await performSearch(title);

  // 📢 If no results, try searching in FR
  if (torrents.length === 0 && titleFR !== null) {
    console.log(`📢 No results found with "${title}", trying with "${titleFR}"`);
    torrents = await performSearch(titleFR);
  }

  // 🛑 Final result
  if (torrents.length > 0) {
    console.log(`🎬 ${torrents.length} torrent(s) selected for ${title} (${type}).`);
  } else {
    console.log(`❌ No filtered torrents found for ${title} (${type}) even after FR search.`);
  }

  return torrents;
}

// Upload magnets via AllDebrid
async function uploadMagnets(magnets, config) {
  const url = "https://api.alldebrid.com/v4/magnet/upload?apikey=" + config.API_KEY_ALLEDBRID;
  const formData = new FormData();
  magnets.forEach(m => formData.append("magnets[]", m.hash));
  try {
    console.log("🔄 Uploading magnets to AllDebrid...");
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });
    if (response.data.status === "success") {
      return response.data.data.magnets.map(magnetData => ({
        hash: magnetData.hash,
        ready: magnetData.ready ? '✅ Ready' : '❌ Not ready',
        name: magnetData.name,
        size: magnetData.size,
        id: magnetData.id
      }));
    } else {
      console.error("❌ Magnet Upload Error:", response.data.data);
      return [];
    }
  } catch (error) {
    console.error("❌ Magnet Upload Error:", error);
    return [];
  }
}

// Retrieve video files for a magnet via AllDebrid
async function getFilesFromMagnetId(magnetId, config) {
  const url = `https://api.alldebrid.com/v4/magnet/files?apikey=${config.API_KEY_ALLEDBRID}`;
  const formData = new FormData();
  formData.append("id[]", magnetId);
  try {
    console.log(`🔄 Retrieving files for magnet ID: ${magnetId}`);
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
      console.log(`🎥 ${filteredVideos.length} video(s) found`);
      return filteredVideos.map(file => ({
        name: file.n,
        size: file.s,
        link: file.l
      }));
    } else {
      console.error("❌ File Retrieval Error:", response.data.data);
      return [];
    }
  } catch (error) {
    console.error("❌ File Retrieval Error:", error);
    return [];
  }
}

// Unlock a link via AllDebrid
async function unlockFileLink(fileLink, config) {
  const url = "http://api.alldebrid.com/v4/link/unlock";
  const formData = new FormData();
  formData.append("link", fileLink);
  try {
    console.log(`🔄 Unlocking link: ${fileLink}`);
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });
    if (response.data.status === "success") {
      return response.data.data.link;
    } else {
      console.error("❌ Unlock Error:", response.data.data);
      return null;
    }
  } catch (error) {
    console.error("❌ Unlock Error:", error);
    return null;
  }
}

// ------------------------------
// Server Configuration
// ------------------------------

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Middleware logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Redirect root "/" to "/config"
app.get('/', (req, res) => {
  res.redirect('/config');
});

// Retrieve configuration from URL
function getConfig(req) {
  if (req.params.variables) {
    try {
      const decoded = Buffer.from(req.params.variables, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (e) {
      throw new Error("Invalid configuration in URL");
    }
  } else {
    throw new Error("Configuration missing in URL");
  }
}

// Route to retrieve configuration
app.get('/:variables/configure', (req, res) => {
  let config;
  try {
    config = getConfig(req);
  } catch (e) {
    return res.status(400).send("Invalid configuration!");
  }

  fs.readFile(path.join(__dirname, 'public', 'config.html'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send("Error loading page.");
    }

    // Replace placeholders with config values
    let page = data
      .replace(/{{TMDB_API_KEY}}/g, config.TMDB_API_KEY || '')
      .replace(/{{API_KEY_ALLEDBRID}}/g, config.API_KEY_ALLEDBRID || '')
      .replace(/{{FILES_TO_SHOW}}/g, config.FILES_TO_SHOW || 5)
      .replace(/{{RES_TO_SHOW}}/g, config.RES_TO_SHOW ? config.RES_TO_SHOW.join(', ') : '')
      .replace(/{{LANG_TO_SHOW}}/g, config.LANG_TO_SHOW ? config.LANG_TO_SHOW.join(', ') : '');

    res.send(page);
  });
});

// Route to serve the configuration page
app.get('/config', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
});

/*
  Manifest endpoint
  Possible paths:
    - /:variables/manifest.json (encoded configuration must be present)
*/
app.get('/:variables/manifest.json', (req, res) => {
  let config;
  try {
    config = getConfig(req);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const manifest = {
    id: 'ygg.stremio.ad',
    version: '0.0.2',
    name: 'Ygg + AD',
    description: 'An addon to access YggTorrent torrents cached on AllDebrid (thanks to Ygg API).',
    types: ['movie', 'series'],
    resources: ['stream'],
    catalogs: [],
    behaviorHints: {
      configurable: true
    }
  };

  res.json(manifest);
});

// Configuration link for Stremio
app.get('/addon.json', (req, res) => {
  const baseUrl = req.protocol + '://' + req.get('host');
  const encodedConfig = Buffer.from(JSON.stringify({
    TMDB_API_KEY: "YOUR_TMDB_API_KEY",
    API_KEY_ALLEDBRID: "YOUR_API_KEY_ALLEDBRID",
    RES_TO_SHOW: ["720p", "1080p", "4k"],
    LANG_TO_SHOW: ["FRENCH", "VOSTFR"],
    FILES_TO_SHOW: 5
  })).toString('base64');

  const addonUrl = `${baseUrl}/${encodedConfig}/manifest.json`;

  res.json({
    addon: addonUrl,
    message: "Add this link in Stremio to configure the addon."
  });
});

/*
  Stream endpoint
  Possible paths:
    - /:variables/stream/:type/:id.json (encoded configuration must be present in the URL)
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
  console.log(`📥 Stream request received for ID: ${id}`);
  const parts = id.split(':');
  const imdbId = parts[0];
  const season = parts[1];
  const episode = parts[2];
  const tmdbData = await getTmdbData(imdbId, config);
  if (!tmdbData) {
    console.log(`❌ Unable to retrieve TMDB info for ${imdbId}`);
    return res.json({ streams: [] });
  }
  console.log(`✅ Content identified: ${tmdbData.title} (${tmdbData.type})`);
  let magnets = [];
  if (tmdbData.type === "series") {
    if (!season || !episode) {
      console.error("❌ For a series, season and episode are required.");
      return res.json({ streams: [] });
    }
    console.log(`📺 Searching for series - S${season}E${episode}`);
    magnets = await searchYgg(tmdbData.title, tmdbData.type, season, episode, config, tmdbData.frenchTitle);
  } else if (tmdbData.type === "movie") {
    console.log("🎬 Searching for movie");
    magnets = await searchYgg(tmdbData.title, tmdbData.type, null, null, config, tmdbData.frenchTitle);
  } else {
    console.error("❌ Unsupported content type:", tmdbData.type);
    return res.json({ streams: [] });
  }
  if (!magnets || magnets.length === 0) {
    console.log("❌ No magnets found for", tmdbData.title);
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
    console.log(`🔎 Checking magnet "${fileStatus.name}" - Status: ${fileStatus.ready}`);
    if (fileStatus.ready === '✅ Ready') {
      let videoFiles = await getFilesFromMagnetId(fileStatus.id, config);
      if (tmdbData.type === "series" && completeMapping[fileStatus.hash]) {
        videoFiles = videoFiles.filter(file => file.name.match(episodePattern));
      }
      for (const file of videoFiles) {
        console.log(`🔄 Attempting to unlock file: ${file.name}`);
        const unlockedLink = await unlockFileLink(file.link, config);
        if (unlockedLink) {
          const { resolution, codec, source } = parseFileName(file.name);
          const titlePrefix = "⚡ ";
          streams.push({
            name: `❤️ YGG + AD ` +
            `🖥️ ${resolution}    ` +
            `🎞️ ${codec} `,
            title: `${titlePrefix}${tmdbData.title} ${tmdbData.type === "series" ? `- S${season.padStart(2, '0')}E${episode.padStart(2, '0')}` : ""}\n` +
                   `${file.name}\n` +
                   `🎬 ${source} | 💾 ${formatSize(file.size)}`,
            url: unlockedLink,
            behaviorHints: {
              bingeGroup: `${tmdbData.title}${tmdbData.type === "series" ? `-S${season.padStart(2, '0')}` : ""}`,
              notWebReady: false,
              betterResolution: file.size > 4 ? true : false
            }
          });
          console.log(`✅ Link unlocked: ${unlockedLink}`);
        } else {
          console.log(`❌ Failed for file: ${file.name}`);
        }
      }
    } else {
      console.log(`❌ Magnet "${fileStatus.name}" is not ready.`);
    }
  }
  console.log(`🎉 ${streams.length} stream(s) obtained`);
  return res.json({ streams: streams.slice(0, config.FILES_TO_SHOW) });
});

// Start the HTTPS server
const sslOptions = {
  key: fs.readFileSync('/etc/ssl/private/server.key'),
  cert: fs.readFileSync('/etc/ssl/certs/server.pem')
};

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`✅ HTTPS server running on https://0-0-0-0.local-ip.sh:${PORT}`);
});
