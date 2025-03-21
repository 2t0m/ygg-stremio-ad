const express = require('express');
const { getTmdbData } = require('../services/tmdb');
const { searchYgg, getTorrentHashFromYgg } = require('../services/yggapi');
const { uploadMagnets, getFilesFromMagnetId, unlockFileLink } = require('../services/alldebrid');
const { parseFileName, formatSize, getConfig } = require('../utils/helpers');

const router = express.Router();

router.get('/:variables/stream/:type/:id.json', async (req, res) => {
  let config;

  // New stream requested
  console.log("--------------------");

  // Retrieve configuration
  try {
    config = getConfig(req);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { type, id } = req.params;
  console.log(`📥 Stream request received for ID: ${id}`);

  // Parse the ID to extract IMDB ID, season, and episode
  const parts = id.split(':');
  const imdbId = parts[0];
  const season = parts[1];
  const episode = parts[2];

  // Retrieve TMDB data
  const tmdbData = await getTmdbData(imdbId, config);
  if (!tmdbData) {
    console.log(`❌ Unable to retrieve TMDB info for ${imdbId}`);
    return res.json({ streams: [] });
  }

  console.log(`✅ Content identified: ${tmdbData.title} (${tmdbData.type})`);

  // Search for torrents on YggTorrent
  const { completeSeriesTorrents, completeSeasonTorrents, episodeTorrents } = await searchYgg(
    tmdbData.title,
    tmdbData.type,
    season,
    episode,
    config,
    tmdbData.frenchTitle
  );

  // Combine all torrents for AllDebrid processing
  const allTorrents = [...completeSeriesTorrents, ...completeSeasonTorrents, ...episodeTorrents];

  // Retrieve hashes for all torrents
  const magnets = [];
  for (const torrent of allTorrents) {
    const hash = await getTorrentHashFromYgg(torrent.id);
    if (hash) {
      torrent.hash = hash;
      magnets.push({ hash, title: torrent.title });
    } else {
      console.log(`❌ Skipping torrent: ${torrent.title} (no hash found)`);
    }
  }

  // Check if any magnets are available
  if (magnets.length === 0) {
    console.log("❌ No magnets available for upload.");
    return res.json({ streams: [] });
  }

  // Upload magnets to AllDebrid
  const filesStatus = await uploadMagnets(magnets, config);

  // Filter ready torrents
  const readySeries = filesStatus.filter(file =>
    completeSeriesTorrents.some(t => t.hash === file.hash) && file.ready === '✅ Ready'
  );
  const readySeasons = filesStatus.filter(file =>
    completeSeasonTorrents.some(t => t.hash === file.hash) && file.ready === '✅ Ready'
  );
  const readyEpisodes = filesStatus.filter(file =>
    episodeTorrents.some(t => t.hash === file.hash) && file.ready === '✅ Ready'
  );

  console.log(`✅ ${readySeries.length} ready torrents for complete series.`);
  console.log(`✅ ${readySeasons.length} ready torrents for complete seasons.`);
  console.log(`✅ ${readyEpisodes.length} ready torrents for episodes.`);

  // Combine all ready torrents
  const readyMagnets = [...readySeries, ...readySeasons, ...readyEpisodes];

  // Unlock files from ready torrents
  const streams = [];
  const unlockAndAddStreams = async (readyTorrents, season, episode) => {
    for (const torrent of readyTorrents) {
      const videoFiles = await getFilesFromMagnetId(torrent.id, config);

      // Filtrer les fichiers vidéo pour inclure uniquement ceux correspondant à la saison et à l'épisode demandés
      const filteredFiles = videoFiles.filter(file => {
        const fileName = file.name.toLowerCase();
        const seasonEpisodePattern = `s${season.padStart(2, '0')}e${episode.padStart(2, '0')}`;
        return fileName.includes(seasonEpisodePattern);
      });

      for (const file of filteredFiles) {
        if (streams.length >= config.FILES_TO_SHOW) {
          console.log(`🎯 Reached the maximum number of streams (${config.FILES_TO_SHOW}). Stopping.`);
          return;
        }

        const unlockedLink = await unlockFileLink(file.link, config);
        if (unlockedLink) {
          const { resolution, codec, source } = parseFileName(file.name);
          streams.push({
            name: `❤️ YGG + AD | 🖥️ ${resolution} | 🎞️ ${codec}`,
            title: `${tmdbData.title} - S${season.padStart(2, '0')}E${episode.padStart(2, '0')}\n${file.name}\n🎬 ${source} | 💾 ${formatSize(file.size)}`,
            url: unlockedLink
          });
          console.log(`✅ Unlocked video: ${file.name}`);
        }
      }
    }
  };

  await unlockAndAddStreams(readyMagnets, season, episode);

  console.log(`🎉 ${streams.length} stream(s) obtained`);
  res.json({ streams });
});

module.exports = router;