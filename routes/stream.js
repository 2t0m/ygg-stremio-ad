const express = require('express');
const { getTmdbData } = require('../services/tmdb');
const { searchYgg, getTorrentHashFromYgg } = require('../services/yggapi');
const { uploadMagnets, getFilesFromMagnetId, unlockFileLink } = require('../services/alldebrid');
const { parseFileName, formatSize, getConfig } = require('../utils/helpers');
const { getCachedMagnetFiles, storeMagnetFiles, getCachedMagnet, storeMagnet, getCachedTmdb, storeTmdb, getCachedYgg, storeYgg, getStoredStreams, storeStreams } = require('../utils/db');

const router = express.Router();

router.get('/:variables/stream/:type/:id.json', async (req, res) => {
  let config;

  // Log the start of a new stream request
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

  // Generate a unique key for the request
  const uniqueKey = `${type}:${imdbId}:${season || ''}:${episode || ''}`;

  // Check if streams are already stored in the database
  const existingStreams = await getStoredStreams(uniqueKey);
  if (existingStreams && existingStreams.length >= config.FILES_TO_SHOW) {
    console.log(`✅ Found ${existingStreams.length} cached streams. Returning cached streams.`);
    return res.json({ streams: existingStreams });
  }

  // Check if TMDB data is already cached
  let tmdbData = await getCachedTmdb(imdbId);
  if (!tmdbData) {
    console.log(`🔍 Retrieving TMDB info for IMDB ID: ${imdbId}`);
    tmdbData = await getTmdbData(imdbId, config);
    if (!tmdbData) {
      console.log(`❌ Unable to retrieve TMDB info for ${imdbId}`);
      return res.json({ streams: [] });
    }
    // Store TMDB data in the cache
    await storeTmdb(imdbId, tmdbData);
    console.log(`💾 Stored TMDB data for IMDB ID: ${imdbId}`);
  } else {
    console.log(`✅ Retrieved TMDB data from cache for IMDB ID: ${imdbId}`);
  }

  console.log(`✅ Content identified: ${tmdbData.title} (${tmdbData.type})`);

  // Check if YggAPI data is already cached
  const yggKey = `${tmdbData.title}:${tmdbData.type}`;
  let searchResults = await getCachedYgg(yggKey);
  if (!searchResults) {
    console.log(`🔍 Searching for torrents on YggTorrent`);
    searchResults = await searchYgg(
      tmdbData.title,
      tmdbData.type,
      season,
      episode,
      config,
      tmdbData.frenchTitle
    );
    // Store YggAPI results in the cache
    await storeYgg(yggKey, searchResults);
    console.log(`💾 Stored YggAPI data for key: ${yggKey}`);
  } else {
    console.log(`✅ Retrieved YggAPI data from cache for key: ${yggKey}`);
  }

  // Combine torrents based on type (series or movie)
  let allTorrents = [];
  if (type === "series") {
    const { completeSeriesTorrents, completeSeasonTorrents, episodeTorrents } = searchResults;
    allTorrents = [...completeSeriesTorrents, ...completeSeasonTorrents, ...episodeTorrents];
  } else if (type === "movie") {
    const { movieTorrents } = searchResults;
    allTorrents = [...movieTorrents];
  }

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

  // Upload all magnets to AllDebrid in one request (use cache if available)
  let filesStatus = [];
  const uncachedMagnets = [];

  for (const magnet of magnets) {
    const cachedMagnet = await getCachedMagnet(magnet.hash);
    if (cachedMagnet) {
      console.log(`✅ Retrieved magnet status from cache: ${magnet.hash}`);
      filesStatus.push(cachedMagnet);
    } else {
      console.log(`🔄 Magnet not in cache: ${magnet.hash}`);
      uncachedMagnets.push(magnet);
    }
  }

  // Upload only uncached magnets
  if (uncachedMagnets.length > 0) {
    console.log(`🔄 Uploading ${uncachedMagnets.length} uncached magnets to AllDebrid`);
    const uploadedStatuses = await uploadMagnets(uncachedMagnets, config);

    // Store the uploaded statuses in the cache
    for (let i = 0; i < uncachedMagnets.length; i++) {
      const magnet = uncachedMagnets[i];
      const status = uploadedStatuses[i];
      await storeMagnet(magnet.hash, status.ready, status);
      filesStatus.push(status);
      console.log(`💾 Stored magnet status in cache: ${magnet.hash}`);
    }
  }

  console.log(`✅ Total magnets processed: ${filesStatus.length}`);

  // Filter ready torrents
  const readyTorrents = filesStatus.filter(file =>
    allTorrents.some(t => t.hash === file.hash) && file.ready === '✅ Ready'
  );

  console.log(`✅ ${readyTorrents.length} ready torrents found.`);

  // Unlock files from ready torrents
  const streams = [];
  const unlockAndAddStreams = async (readyTorrents) => {
    for (const torrent of readyTorrents) {
      if (streams.length >= config.FILES_TO_SHOW) {
        console.log(`🎯 Reached the maximum number of streams (${config.FILES_TO_SHOW}). Stopping.`);
        break;
      }

      let videoFiles = await getCachedMagnetFiles(torrent.hash);
      if (!videoFiles) {
        console.log(`🔄 Retrieving files for magnet ID: ${torrent.id}`);
        videoFiles = await getFilesFromMagnetId(torrent.id, config);
        await storeMagnetFiles(torrent.hash, videoFiles);
        console.log(`💾 Stored files for magnet hash: ${torrent.hash}`);
      } else {
        console.log(`✅ Retrieved files from cache for magnet hash: ${torrent.hash}`);
      }

      // Filter video files
      const filteredFiles = videoFiles.filter(file => {
        const fileName = file.name.toLowerCase();

        // If it's a movie, include all files
        if (type === "movie") {
          return true;
        }

        // Check if season and episode variables are defined
        if (season && episode) {
          const seasonEpisodePattern = `s${season.padStart(2, '0')}e${episode.padStart(2, '0')}`;
          return fileName.includes(seasonEpisodePattern);
        }

        // Exclude the file if no condition is met
        return false;
      });

      // Unlock filtered files
      for (const file of filteredFiles) {
        if (streams.length >= config.FILES_TO_SHOW) {
          console.log(`🎯 Reached the maximum number of streams (${config.FILES_TO_SHOW}). Stopping.`);
          break;
        }

        const unlockedLink = await unlockFileLink(file.link, config);
        if (unlockedLink) {
          const { resolution, codec, source } = parseFileName(file.name);
          streams.push({
            name: `❤️ YGG + AD | 🖥️ ${resolution} | 🎞️ ${codec}`,
            title: `${tmdbData.title}${season && episode ? ` - S${season.padStart(2, '0')}E${episode.padStart(2, '0')}` : ''}\n${file.name}\n🎬 ${source} | 💾 ${formatSize(file.size)}`,
            url: unlockedLink
          });
          console.log(`✅ Unlocked video: ${file.name}`);
        }
      }
    }
  };

  await unlockAndAddStreams(readyTorrents);

  // Store streams in the database if the required number of streams is reached
  if (streams.length > 0) {
    await storeStreams(uniqueKey, type, tmdbData.title, season, episode, streams);
    console.log(`💾 Stored ${streams.length} streams in the database.`);
  }

  console.log(`🎉 ${streams.length} stream(s) obtained`);
  res.json({ streams });
});

module.exports = router;