const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger'); // Import the logger

// Upload magnets to AllDebrid
async function uploadMagnets(magnets, config) {
  const url = `https://api.alldebrid.com/v4/magnet/upload?apikey=${config.API_KEY_ALLEDBRID}`;
  
  // Extract hashes from the magnets parameter
  const hashes = magnets.map(m => m.hash);
  const formData = new FormData();
  hashes.forEach(hash => formData.append("magnets[]", hash));

  try {
    logger.info("🔄 Uploading magnets...");
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });

    if (response.data.status === "success") {
      logger.info(`✅ Successfully uploaded ${response.data.data.magnets.length} magnets.`);
      return response.data.data.magnets.map(magnet => ({
        hash: magnet.hash,
        ready: magnet.ready ? '✅ Ready' : '❌ Not ready',
        name: magnet.name,
        size: magnet.size,
        id: magnet.id
      }));
    } else {
      logger.warn("❌ Error uploading magnets:", response.data.data);
      return [];
    }
  } catch (error) {
    logger.error("❌ Upload error:", error.response?.data || error.message);
    return [];
  }
}

// Retrieve video files for a magnet
async function getFilesFromMagnetId(magnetId, config) {
  const url = `https://api.alldebrid.com/v4/magnet/files?apikey=${config.API_KEY_ALLEDBRID}`;
  const formData = new FormData();
  formData.append("id[]", magnetId);

  try {
    logger.info(`🔄 Retrieving files for magnet ID: ${magnetId}`);
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });

    if (response.data.status === "success") {
      const files = response.data.data.magnets[0].files;
      const videoExtensions = [".mp4", ".mkv", ".avi", ".mov", ".wmv"];

      // Recursive function to extract only video files
      const extractVideos = (fileList) => {
        const videos = [];
        fileList.forEach(file => {
          if (file.e && Array.isArray(file.e)) {
            // If the file contains sub-files, process them recursively
            videos.push(...extractVideos(file.e));
          } else if (file.n && file.l) {
            // Check if the file is a video
            const fileName = file.n.toLowerCase();
            if (videoExtensions.some(ext => fileName.endsWith(ext))) {
              videos.push({
                name: file.n,
                size: file.s || 0,
                link: file.l
              });
            }
          }
        });
        return videos;
      };

      // Extract video files
      const filteredVideos = extractVideos(files);

      logger.info(`🎥 ${filteredVideos.length} video(s) found for magnet ID: ${magnetId}`);
      logger.debug(`🎥 Filtered videos for magnet ID ${magnetId}: ${JSON.stringify(filteredVideos, null, 2)}`);

      return filteredVideos;
    } else {
      logger.warn("❌ Error retrieving files:", response.data.data);
      return [];
    }
  } catch (error) {
    logger.error("❌ File retrieval error:", error);
    return [];
  }
}

// Unlock a link via AllDebrid
async function unlockFileLink(fileLink, config) {
  const url = "http://api.alldebrid.com/v4/link/unlock";
  const formData = new FormData();
  formData.append("link", fileLink);

  try {
    logger.info(`🔄 Unlocking link: ${fileLink}`);
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });

    if (response.data.status === "success") {
      return response.data.data.link;
    } else {
      logger.warn("❌ Error unlocking link:", response.data.data);
      return null;
    }
  } catch (error) {
    logger.error("❌ Unlock error:", error);
    return null;
  }
}

module.exports = { uploadMagnets, getFilesFromMagnetId, unlockFileLink };