const express = require('express');
const { getTmdbData } = require('../services/tmdb');
const { searchYgg, getTorrentHashFromYgg } = require('../services/yggapi');
const { searchSharewood } = require('../services/sharewoodapi');
const { uploadMagnets, getFilesFromMagnetId, unlockFileLink } = require('../services/alldebrid');
const { parseFileName, formatSize, getConfig } = require('../utils/helpers');
const logger = require('../utils/logger');
const { getCachedStream, storeStream } = require('../utils/db');

const router = express.Router();

router.get('/:variables/stream/:type/:id.json', async (req, res) => {
  let config;
  // Log the request details
  logger.debug(`📡 Received stream request: ${req.method} ${req.originalUrl}`);

  // Log the start of a new stream request
  logger.info("--------------------");

  // Retrieve configuration
  try {
    config = getConfig(req);
  } catch (e) {
    logger.error("❌ Invalid configuration in request:", e.message);
    return res.status(400).json({ error: e.message });
  }

  const { type, id } = req.params;
  logger.info(`📥 Stream request received for ID: ${id}`);

  // Parse the ID to extract IMDB ID, season, and episode
  const parts = id.split(':');
  const imdbId = parts[0];
  const season = parts[1] || null;
  const episode = parts[2] || null;

  // 👉 Check cache immediately after parsing IDs
  const cachedStream = await getCachedStream(imdbId, season, episode);
  if (cachedStream) {
    logger.info(`✅ Stream found in cache for ${imdbId} S${season || ''}E${episode || ''}`);
    return res.json({ streams: cachedStream });
  }

  // Retrieve TMDB data based on IMDB ID
  logger.info(`🔍 Retrieving TMDB info for IMDB ID: ${imdbId}`);
  const tmdbData = await getTmdbData(imdbId, config);
  if (!tmdbData) {
    logger.warn(`❌ Unable to retrieve TMDB info for ${imdbId}`);
    return res.json({ streams: [] });
  }

  // Call searchYgg and searchSharewood to retrieve processed torrents
  const [yggResults, sharewoodResults] = await Promise.all([
    searchYgg(
      tmdbData.title,
      tmdbData.type,
      season,
      episode,
      config,
      tmdbData.frenchTitle
    ),
    searchSharewood(
      tmdbData.title,
      tmdbData.type,
      season,
      episode,
      config
    )
  ]);

  logger.info(`✅ Found ${yggResults.movieTorrents.length + yggResults.completeSeriesTorrents.length + yggResults.completeSeasonTorrents.length + yggResults.episodeTorrents.length} torrents on YggTorrent for "${tmdbData.title}".`);
  logger.info(`✅ Found ${sharewoodResults.movieTorrents.length + sharewoodResults.completeSeriesTorrents.length + sharewoodResults.completeSeasonTorrents.length + sharewoodResults.episodeTorrents.length} torrents on Sharewood for "${tmdbData.title}".`);

  // Combine results from both sources
  const combinedResults = {
    completeSeriesTorrents: [
      ...yggResults.completeSeriesTorrents,
      ...sharewoodResults.completeSeriesTorrents
    ],
    completeSeasonTorrents: [
      ...yggResults.completeSeasonTorrents,
      ...sharewoodResults.completeSeasonTorrents
    ],
    episodeTorrents: [
      ...yggResults.episodeTorrents,
      ...sharewoodResults.episodeTorrents
    ],
    movieTorrents: [
      ...yggResults.movieTorrents,
      ...sharewoodResults.movieTorrents
    ]
  };

  logger.debug(`🔗 Combined Results: ${JSON.stringify(combinedResults, null, 2)}`);

  // Check if any results were found
  if (!combinedResults || (
    combinedResults.completeSeriesTorrents.length === 0 &&
    combinedResults.completeSeasonTorrents.length === 0 &&
    combinedResults.episodeTorrents.length === 0 &&
    combinedResults.movieTorrents.length === 0
  )) {
    logger.warn("❌ No torrents found for the requested content.");
    return res.json({ streams: [] });
  }

  // Combine torrents based on type (series or movie)
  let allTorrents = [];
  if (type === "series") {
    const { completeSeriesTorrents, completeSeasonTorrents, episodeTorrents } = combinedResults;

    logger.debug(`📝 Torrents categorized as complete series: ${completeSeriesTorrents.map(t => `${t.title} (hash: ${t.hash})`).join(', ')}`);
    logger.debug(`📝 Torrents categorized as complete seasons: ${completeSeasonTorrents.map(t => `${t.title} (hash: ${t.hash})`).join(', ')}`);
    logger.debug(`📝 Torrents categorized as specific episodes: ${episodeTorrents.map(t => `${t.title} (hash: ${t.hash})`).join(', ')}`);

    // Filter episode torrents to ensure they match the requested season and episode
    const filteredEpisodeTorrents = episodeTorrents.filter(torrent => {
      const torrentTitle = torrent.title.toLowerCase();
      const seasonEpisodePattern1 = `s${season.padStart(2, '0')}e${episode.padStart(2, '0')}`;
      const seasonEpisodePattern2 = `s${season.padStart(2, '0')}.e${episode.padStart(2, '0')}`;
      const matches = torrentTitle.includes(seasonEpisodePattern1) || torrentTitle.includes(seasonEpisodePattern2);
      logger.debug(`🔍 Checking episode torrent "${torrent.title}" against patterns "${seasonEpisodePattern1}" and "${seasonEpisodePattern2}": ${matches}`);
      return matches;
    });

    allTorrents = [...completeSeriesTorrents, ...completeSeasonTorrents, ...filteredEpisodeTorrents];
  } else if (type === "movie") {
    const { movieTorrents } = combinedResults;
    logger.debug(`📝 Torrents categorized as movies: ${movieTorrents.map(t => t.title).join(', ')}`);
    allTorrents = [...movieTorrents];
  }

  // Limit the number of torrents to process
  const maxTorrentsToProcess = config.FILES_TO_SHOW * 2;
  const limitedTorrents = allTorrents.slice(0, maxTorrentsToProcess);

  // Retrieve hashes for the torrents
  const magnets = [];
  for (const torrent of limitedTorrents) {
    if (torrent.hash) {
      magnets.push({ hash: torrent.hash, title: torrent.title, source: torrent.source || "Unknown" });
    } else {
      const hash = await getTorrentHashFromYgg(torrent.id);
      if (hash) {
        torrent.hash = hash;
        magnets.push({ hash, title: torrent.title, source: torrent.source || "Unknown" });
      } else {
        logger.warn(`❌ Skipping torrent: ${torrent.title} (no hash found)`);
      }
    }
  }

  logger.info(`✅ Processed ${magnets.length} torrents (limited to ${maxTorrentsToProcess}).`);

  // Check if any magnets are available
  if (magnets.length === 0) {
    logger.warn("❌ No magnets available for upload.");
    return res.json({ streams: [] });
  }

  // Upload magnets to AllDebrid
  logger.info(`🔄 Uploading ${magnets.length} magnets to AllDebrid`);
  const uploadedStatuses = await uploadMagnets(magnets, config);

  // Filter ready torrents
  const readyTorrents = uploadedStatuses.filter(file => file.ready === '✅ Ready');

  logger.info(`✅ ${readyTorrents.length} ready torrents found.`);
  readyTorrents.forEach(torrent => {
    logger.debug(`✅ Ready torrent: ${torrent.hash} (Torrent: ${torrent.name})`);
  });

  // Unlock files from ready torrents
  const streams = [];
  const unlockAndAddStreams = async (readyTorrents) => {
    for (const torrent of readyTorrents) {
      if (streams.length >= config.FILES_TO_SHOW) {
        logger.info(`🎯 Reached the maximum number of streams (${config.FILES_TO_SHOW}). Stopping.`);
        break;
      }

      const videoFiles = await getFilesFromMagnetId(torrent.id, torrent.source, config);

      // For each video file: unlock, cache, and push the correct stream in filteredFiles
      const filteredFiles = [];
      for (const file of videoFiles) {
        const fileName = file.name.toLowerCase();
        const { resolution, codec, source } = parseFileName(file.name);

        if (type === "series") {
          const episodeRegex = /s(\d{2})e(\d{2})/i;
          const match = fileName.match(episodeRegex);
          if (match) {
            const detectedSeason = match[1];
            const detectedEpisode = match[2];

            // Check if already cached
            const cached = await getCachedStream(imdbId, detectedSeason, detectedEpisode);
            let streamObj;
            if (cached && cached.length > 0) {
              streamObj = cached[0];
              logger.debug(`♻️ Stream loaded from cache for ${imdbId} S${detectedSeason}E${detectedEpisode}`);
            } else {
              const unlockedLink = await unlockFileLink(file.link, config);
              if (!unlockedLink) continue;
              streamObj = {
                name: `❤️ ${torrent.source} + AD | 🖥️ ${resolution} | 🎞️ ${codec}`,
                title: `${tmdbData.title}\n${file.name}\n🎬 ${source} | 💾 ${formatSize(file.size)}`,
                url: unlockedLink
              };
              await storeStream(imdbId, detectedSeason, detectedEpisode, [streamObj]);
              logger.debug(`💾 Stream cached for ${imdbId} S${detectedSeason}E${detectedEpisode}`);
            }
            // If it's the requested episode, push it to filteredFiles
            if (
              detectedSeason === season?.padStart(2, '0') &&
              detectedEpisode === episode?.padStart(2, '0') &&
              filteredFiles.length < config.FILES_TO_SHOW
            ) {
              filteredFiles.push(streamObj);
              logger.info(`✅ Unlocked video: ${file.name}`);
            }
          }
        } else if (type === "movie") {
          // Same logic for movies
          const cached = await getCachedStream(imdbId, null, null);
          let streamObj;
          if (cached && cached.length > 0) {
            streamObj = cached[0];
            logger.debug(`♻️ Stream loaded from cache for ${imdbId} (movie)`);
          } else {
            const unlockedLink = await unlockFileLink(file.link, config);
            if (!unlockedLink) continue;
            streamObj = {
              name: `❤️ ${torrent.source} + AD | 🖥️ ${resolution} | 🎞️ ${codec}`,
              title: `${tmdbData.title}\n${file.name}\n🎬 ${source} | 💾 ${formatSize(file.size)}`,
              url: unlockedLink
            };
            await storeStream(imdbId, null, null, [streamObj]);
            logger.debug(`💾 Stream cached for ${imdbId} (movie)`);
          }
          if (filteredFiles.length < config.FILES_TO_SHOW) {
            filteredFiles.push(streamObj);
            logger.info(`✅ Unlocked video: ${file.name}`);
          }
        }
      }

      // Add filtered streams to the global response
      streams.push(...filteredFiles);

      // Log a warning if no files were unlocked
      if (filteredFiles.length === 0) {
        logger.warn(`⚠️ No files matched the requested season/episode for torrent ${torrent.hash}`);
      }
    }
  };

  await unlockAndAddStreams(readyTorrents);

  // Store streams in cache if any were found
  if (streams.length > 0) {
    await storeStream(imdbId, season, episode, streams);
    logger.info(`💾 Streams cached for ${imdbId} S${season || ''}E${episode || ''}`);
  }

  logger.info(`🎉 ${streams.length} stream(s) obtained`);
  res.json({ streams });
});

module.exports = router;