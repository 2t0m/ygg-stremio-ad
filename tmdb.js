const axios = require('axios');

// Retrieve TMDB data
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

module.exports = { getTmdbData };