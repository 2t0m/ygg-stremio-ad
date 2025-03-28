const axios = require('axios');
const logger = require('../utils/logger');

// Map subcategories for Sharewood
const SUBCATEGORY_MAP = {
  movie: [9, 11],
  series: [10, 12]
};

// Perform a search on Sharewood
async function searchSharewood(title, type, season = null, episode = null, config) {
  const subcategories = SUBCATEGORY_MAP[type];
  if (!subcategories) {
    logger.error(`❌ Invalid type "${type}" for Sharewood search.`);
    return {
      completeSeriesTorrents: [],
      completeSeasonTorrents: [],
      episodeTorrents: [],
      movieTorrents: []
    };
  }

  const subcategoryParams = subcategories.map(id => `subcategory_id=${id}`).join(',');
  const seasonFormatted = season ? ` S${season.padStart(2, '0')}` : '';
  const requestUrl = `https://www.sharewood.tv/api/${config.SHAREWOOD_PASSKEY}/search?name=${encodeURIComponent(title + " " +seasonFormatted)}&category=1&subcategory_id=${subcategoryParams}`;

  logger.debug(`🔍 Performing Sharewood search with URL: ${requestUrl}`);

  try {
    const response = await axios.get(requestUrl);
    const torrents = response.data || [];

    logger.info(`✅ Found ${torrents.length} torrents on Sharewood for "${title}".`);

    // Process torrents to structure the results
    return processTorrents(torrents, type, season, episode, config);
  } catch (error) {
    logger.error(`❌ Sharewood Search Error: ${error.message}`);
    return {
      completeSeriesTorrents: [],
      completeSeasonTorrents: [],
      episodeTorrents: [],
      movieTorrents: []
    };
  }
}

// Process torrents based on type, season, and episode
function processTorrents(torrents, type, season, episode, config) {
      // Log the received torrents
//   logger.debug(`🔍 Received ${torrents.length} torrents for processing.`);
//   logger.debug(`📋 Torrents: ${JSON.stringify(torrents, null, 2)}`);

  const completeSeriesTorrents = [];
  const completeSeasonTorrents = [];
  const episodeTorrents = [];
  const movieTorrents = [];

  // Trier les torrents par priorité
  torrents.sort((a, b) => {
    const priorityA = prioritizeTorrent(a, config);
    const priorityB = prioritizeTorrent(b, config);

    if (priorityA.resolution !== priorityB.resolution) {
      return priorityA.resolution - priorityB.resolution;
    }
    if (priorityA.language !== priorityB.language) {
      return priorityA.language - priorityB.language;
    }
    return priorityA.codec - priorityB.codec;
  });

  if (type === "movie") {
    logger.debug(`🔍 Filtering movies`);
    movieTorrents.push(
      ...torrents
        .filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.name.toLowerCase().includes(res.toLowerCase())) &&
          config.LANG_TO_SHOW.some(lang => torrent.language.toLowerCase().includes(lang.toLowerCase())) &&
          config.CODECS_TO_SHOW.some(codec => torrent.name.toLowerCase().includes(codec.toLowerCase()))
        )
        .map(torrent => ({
          id: torrent.id,
          hash: torrent.info_hash,
          title: torrent.name,
          resolution: torrent.type,
          size: torrent.size,
          seeders: torrent.seeders,
          leechers: torrent.leechers,
          language: torrent.language,
          download_url: torrent.download_url,
          created_at: torrent.created_at,
          source: "SW"
        }))
    );
    logger.debug(`🎬 ${movieTorrents.length} movie torrents found.`);
  }

  if (type === "series") {
    if (season) {
      const seasonFormatted = season.padStart(2, '0');
      logger.debug(`🔍 Filtering complete seasons: S${seasonFormatted}`);
      completeSeasonTorrents.push(
        ...torrents
          .filter(torrent =>
            torrent.name.toLowerCase().includes(`s${seasonFormatted}`) &&
            !torrent.name.toLowerCase().match(new RegExp(`s${seasonFormatted}e\\d{2}`, "i")) &&
            !torrent.name.toLowerCase().match(new RegExp(`s${seasonFormatted}\\.e\\d{2}`, "i"))
          )
          .map(torrent => ({
            id: torrent.id,
            hash: torrent.info_hash,
            title: torrent.name,
            resolution: torrent.type,
            size: torrent.size,
            seeders: torrent.seeders,
            leechers: torrent.leechers,
            language: torrent.language,
            download_url: torrent.download_url,
            created_at: torrent.created_at,
            source: "SW"
          }))
      );
      logger.debug(`🎬 ${completeSeasonTorrents.length} complete season torrents found.`);
    }

    if (season && episode) {
      const seasonFormatted = season.padStart(2, '0');
      const episodeFormatted = episode.padStart(2, '0');
      const patterns = [
        `s${seasonFormatted}e${episodeFormatted}`,
        `s${seasonFormatted}.e${episodeFormatted}`
      ];

      logger.debug(`🔍 Filtering specific episodes: Patterns ${patterns.join(', ')}`);
      episodeTorrents.push(
        ...torrents
          .filter(torrent =>
            patterns.some(pattern => torrent.name.toLowerCase().includes(pattern))
          )
          .map(torrent => ({
            id: torrent.id,
            hash: torrent.info_hash,
            title: torrent.name,
            resolution: torrent.type,
            size: torrent.size,
            seeders: torrent.seeders,
            leechers: torrent.leechers,
            language: torrent.language,
            download_url: torrent.download_url,
            created_at: torrent.created_at,
            source: "SW"
          }))
      );
      logger.debug(`🎬 ${episodeTorrents.length} episode torrents found.`);
    }
  }

  return { completeSeriesTorrents, completeSeasonTorrents, episodeTorrents, movieTorrents };
}

function prioritizeTorrent(torrent, config) {
  const resolutionPriority = config.RES_TO_SHOW.findIndex(res => torrent.name.toLowerCase().includes(res.toLowerCase()));
  const languagePriority = config.LANG_TO_SHOW.findIndex(lang => torrent.language.toLowerCase().includes(lang.toLowerCase()));
  const codecPriority = config.CODECS_TO_SHOW.findIndex(codec => torrent.name.toLowerCase().includes(codec.toLowerCase()));

  return {
    resolution: resolutionPriority === -1 ? Infinity : resolutionPriority,
    language: languagePriority === -1 ? Infinity : languagePriority,
    codec: codecPriority === -1 ? Infinity : codecPriority
  };
}

module.exports = { searchSharewood, processTorrents };