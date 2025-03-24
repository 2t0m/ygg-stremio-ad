const axios = require('axios');

// Retrieve the hash of a torrent on YggTorrent
async function getTorrentHashFromYgg(torrentId) {
  const url = `https://yggapi.eu/torrent/${torrentId}`;
  try {
    const response = await axios.get(url);
    if (response.data && response.data.hash) {
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
    const requestUrl = `https://yggapi.eu/torrents?q=${encodeURIComponent(searchTitle)}&page=1&per_page=100&order_by=uploaded_at`;
    try {
      const response = await axios.get(requestUrl);
      let torrents = response.data || [];
      torrents.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

      // Prioritize languages, resolutions, and codecs
      const prioritize = (torrent, priorities) => {
        for (let i = 0; i < priorities.length; i++) {
          if (torrent.title.toLowerCase().includes(priorities[i].toLowerCase())) {
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

      return torrents;
    } catch (error) {
      console.error("❌ Ygg Search Error:", error);
      return [];
    }
  }

  // 🔍 Initial search with the original title
  let torrents = await performSearch(title);

  // 📢 If no results, try searching in FR
  if (torrents.length === 0 && titleFR !== null && title !== titleFR) {
    console.log(`📢 No results found with "${title}", trying with "${titleFR}"`);
    torrents = await performSearch(titleFR);
  }

  // 🛑 If no torrents found, return empty
  if (torrents.length === 0) {
    console.log(`❌ No torrents found for ${title}`);
    return { completeSeriesTorrents: [], completeSeasonTorrents: [], episodeTorrents: [] };
  }

  // Arrays to store categorized torrents
  const completeSeriesTorrents = [];
  const completeSeasonTorrents = [];
  const episodeTorrents = [];

  // Search for complete series
  if (type === "series") {
    console.log(`🔍 Searching for complete series with the word "COMPLETE"`);
    completeSeriesTorrents.push(
      ...torrents.filter(torrent =>
        config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
        config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
        config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase())) &&
        torrent.title.toUpperCase().includes("COMPLETE")
      )
    );
    console.log(`🎬 ${completeSeriesTorrents.length} complete series torrents found.`);
  }

  // Search for complete season
  if (type === "series" && season) {
    const seasonFormatted = season.padStart(2, '0');
    console.log(`🔍 Searching for complete season: S${seasonFormatted}`);
    completeSeasonTorrents.push(
      ...torrents.filter(torrent =>
        config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
        config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
        config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase())) &&
        torrent.title.toLowerCase().includes(`s${seasonFormatted}`) &&
        !torrent.title.toLowerCase().match(new RegExp(`s${seasonFormatted}e\\d{2}`, "i")) // Exclude specific episodes
      )
    );
    console.log(`🎬 ${completeSeasonTorrents.length} complete season torrents found.`);
  }

  // Search for specific episodes
  if (type === "series" && season && episode) {
    const seasonFormatted = season.padStart(2, '0');
    const episodeFormatted = episode.padStart(2, '0');
    console.log(`🔍 Searching for specific episode: S${seasonFormatted}E${episodeFormatted}`);
    episodeTorrents.push(
      ...torrents.filter(torrent =>
        config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
        config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
        config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase())) &&
        torrent.title.toLowerCase().includes(`s${seasonFormatted}e${episodeFormatted}`)
      )
    );
    console.log(`🎬 ${episodeTorrents.length} episode torrents found.`);
  }

  // Search for movies
  if (type === "movie") {
    console.log("🔍 Searching for movie");

    const movieTorrents = [];
    movieTorrents.push(
      ...torrents.filter(torrent =>
        config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
        config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
        config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase()))
      )
    );
    console.log(`🎬 ${movieTorrents.length} movie torrents found.`);
    return { movieTorrents };
  }

  return { completeSeriesTorrents, completeSeasonTorrents, episodeTorrents };
}

module.exports = { getTorrentHashFromYgg, searchYgg };