const axios = require('axios');

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
        console.log(`🔍 Searching for complete season: S${seasonFormatted} or S${parseInt(seasonFormatted, 10)}`);
        let completeSeasonTorrents = torrents.filter(torrent =>
          config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
          config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
          config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase())) &&
          (
            torrent.title.toLowerCase().includes(`s${seasonFormatted}`) || // Format S01
            torrent.title.toLowerCase().includes(`s${parseInt(seasonFormatted, 10)}`) // Format S1
          ) &&
          !torrent.title.toLowerCase().match(new RegExp(`s${seasonFormatted}e\\d{2}`, "i")) // Exclure les épisodes spécifiques
        );

        // Search for complete series with the word "COMPLETE"
        console.log(`🔍 Searching for complete series with the word "COMPLETE"`);
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
          console.log(`🔍 Searching for specific episode: S${seasonFormatted}E${episodeFormatted}`);
          let episodeTorrents = torrents.filter(torrent =>
            config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase())) &&
            config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase())) &&
            config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase())) &&
            (
              torrent.title.toLowerCase().includes(`s${seasonFormatted}e${episodeFormatted}`) || // Format S01E01
              torrent.title.toLowerCase().includes(`s${seasonFormatted}`) // Format S01
            )
          );

          torrents.forEach(torrent => {
            console.log(`Checking torrent: ${torrent.title}`);
            console.log(`  Matches resolution: ${config.RES_TO_SHOW.some(res => torrent.title.toLowerCase().includes(res.toLowerCase()))}`);
            console.log(`  Matches language: ${config.LANG_TO_SHOW.some(lang => torrent.title.toLowerCase().includes(lang.toLowerCase()))}`);
            console.log(`  Matches codec: ${config.CODECS_TO_SHOW.some(codec => torrent.title.toLowerCase().includes(codec.toLowerCase()))}`);
            console.log(`  Matches season: ${torrent.title.toLowerCase().includes(`s${seasonFormatted}`)}`);
            console.log(`  Matches episode: ${torrent.title.toLowerCase().includes(`s${seasonFormatted}e${episodeFormatted}`)}`);
          });

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
  if (torrents.length === 0 && titleFR !== null && title !== titleFR) {
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

module.exports = { getTorrentHashFromYgg, searchYgg };