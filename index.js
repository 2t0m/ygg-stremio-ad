const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const path = require('path');
const https = require('https');
const fs = require('fs');
const { getTmdbData } = require('./tmdb');
const { getTorrentHashFromYgg, searchYgg } = require('./yggapi');
const { uploadMagnets, getFilesFromMagnetId, unlockFileLink } = require('./alldebrid');

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

  // Log the search configuration once
  console.log("🔍 Search configuration:");
  console.log(`   📜 Languages: ${config.LANG_TO_SHOW.join(', ')}`);
  console.log(`   🎞️ Codecs: ${config.CODECS_TO_SHOW.join(', ')}`);
  console.log(`   🖥️ Resolutions: ${config.RES_TO_SHOW.join(', ')}`);

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
    console.log(`📺 Searching for series`);
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
            name: `❤️ YGG + AD ` +
            `🖥️ ${resolution} ` +
            `🎞️ ${codec} `,
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
