const axios = require('axios');
const logger = require('../utils/logger');

// Retrieve the hash of a torrent on YggTorrent
async function getTorrentHashFromYgg(torrentId) {
  const url = `https://yggapi.eu/torrent/${torrentId}`;
  try {
    const response = await axios.get(url);
    if (response.data && response.data.hash) {
      return response.data.hash;
    }
  } catch (error) {
    logger.error(`❌ Hash Retrieval Error for ${torrentId}: ${error.message}`);
    return null;
  }
  return null;
}

// Process torrents based on type, season, and episode
function processTorrents(torrents, type, season, episode, config) {
  const completeSeriesTorrents = [];
  const completeSeasonTorrents = [];
  const episodeTorrents = [];
  const movieTorrents = [];

  if (type === "movie") {
    logger.debug(`🔍 Searching for movies`);
    movieTorrents.push(
      ...torrents
        .filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
          config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
          config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase()))
        )
        .map(torrent => ({ ...torrent, category: "movieTorrents" }))
    );
    logger.debug(`🎬 ${movieTorrents.length} movie torrents found.`);
  }

  if (type === "series") {
    logger.debug(`🔍 Searching for complete series with the word "COMPLETE"`);
    completeSeriesTorrents.push(
      ...torrents
        .filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
          config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
          config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase())) &&
          torrent.title.toUpperCase().includes("COMPLETE")
        )
        .map(torrent => ({ ...torrent, category: "completeSeriesTorrents" }))
    );
    logger.debug(`🎬 ${completeSeriesTorrents.length} complete series torrents found.`);
  }

  if (type === "series" && season) {
    const seasonFormatted = season.padStart(2, '0');
    logger.debug(`🔍 Searching for complete season: S${seasonFormatted}`);
    completeSeasonTorrents.push(
      ...torrents
        .filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
          config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
          config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase())) &&
          torrent.title.toLowerCase().includes(`s${seasonFormatted}`) &&
          !torrent.title.toLowerCase().match(new RegExp(`s${seasonFormatted}e\\d{2}`, "i")) &&
          !torrent.title.toLowerCase().match(new RegExp(`s${seasonFormatted}\\.e\\d{2}`, "i"))
        )
        .map(torrent => ({ ...torrent, category: "completeSeasonTorrents" }))
    );
    logger.debug(`🎬 ${completeSeasonTorrents.length} complete season torrents found.`);
  }

  if (type === "series" && season && episode) {
    const seasonFormatted = season.padStart(2, '0');
    const episodeFormatted = episode.padStart(2, '0');
    logger.debug(`🔍 Searching for specific episode: S${seasonFormatted}E${episodeFormatted}`);
    episodeTorrents.push(
      ...torrents
        .filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
          config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
          config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase())) &&
          (
            torrent.title.toLowerCase().includes(`s${seasonFormatted}e${episodeFormatted}`) ||
            torrent.title.toLowerCase().includes(`s${seasonFormatted}.e${episodeFormatted}`)
          )
        )
        .map(torrent => ({ ...torrent, category: "episodeTorrents" }))
    );
    logger.debug(`🎬 ${episodeTorrents.length} episode torrents found.`);
  }

  return { completeSeriesTorrents, completeSeasonTorrents, episodeTorrents, movieTorrents };
}

// Search for torrents on YggTorrent
async function searchYgg(title, type, season, episode, config, titleFR = null) {
  logger.debug(`🔍 Searching for torrents on YggTorrent`);
  let torrents = await performSearch(title, type, config);

  if (torrents.length === 0 && titleFR !== null && title !== titleFR) {
    logger.warn(`📢 No results found with "${title}", trying with "${titleFR}"`);
    torrents = await performSearch(titleFR, type, config);
  }

  if (torrents.length === 0) {
    logger.error(`❌ No torrents found for ${title}`);
    return { completeSeriesTorrents: [], completeSeasonTorrents: [], episodeTorrents: [], movieTorrents: [] };
  }

  return processTorrents(torrents, type, season, episode, config);
}

async function performSearch(searchTitle, type, config) {
  const categoryIds = type === "movie" 
    ? [2178, 2183]
    : [2179, 2184];

  const categoryParams = categoryIds.map(id => `category_id=${id}`).join('&');
  const requestUrl = `https://yggapi.eu/torrents?q=${encodeURIComponent(searchTitle)}&page=1&per_page=100&order_by=uploaded_at&${categoryParams}`;

  logger.debug(`🔍 Performing search with URL: ${requestUrl}`);

  try {
    const response = await axios.get(requestUrl);
    let torrents = response.data || [];

    torrents.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

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

    return torrents;
  } catch (error) {
    logger.error("❌ Ygg Search Error:", error.message);
    return [];
  }
}

function prioritizeTorrent(torrent, config) {
  const resolutionPriority = config.RES_TO_SHOW.findIndex(res => torrent.title.toLowerCase().includes(res.toLowerCase()));
  const languagePriority = config.LANG_TO_SHOW.findIndex(lang => torrent.title.toLowerCase().includes(lang.toLowerCase()));
  const codecPriority = config.CODECS_TO_SHOW.findIndex(codec => torrent.title.toLowerCase().includes(codec.toLowerCase()));

  return {
    resolution: resolutionPriority === -1 ? Infinity : resolutionPriority,
    language: languagePriority === -1 ? Infinity : languagePriority,
    codec: codecPriority === -1 ? Infinity : codecPriority
  };
}

module.exports = { getTorrentHashFromYgg, searchYgg };