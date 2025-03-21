const axios = require('axios');
const FormData = require('form-data');

// Upload magnets to AllDebrid
async function uploadMagnets(magnets, config) {
  const url = `https://api.alldebrid.com/v4/magnet/upload?apikey=${config.API_KEY_ALLEDBRID}`;
  const formData = new FormData();

  // Add magnet hashes to the form data
  magnets.forEach(m => formData.append("magnets[]", m.hash));

  try {
    console.log("🔄 Uploading magnets...");
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });

    if (response.data.status === "success") {
      return response.data.data.magnets.map(magnet => ({
        hash: magnet.hash,
        ready: magnet.ready ? '✅ Ready' : '❌ Not ready',
        name: magnet.name,
        size: magnet.size,
        id: magnet.id
      }));
    } else {
      console.error("❌ Error uploading magnets:", response.data.data);
      return [];
    }
  } catch (error) {
    console.error("❌ Upload error:", error.response?.data || error.message);
    return [];
  }
}

// Retrieve video files for a magnet
async function getFilesFromMagnetId(magnetId, config) {
  const url = `https://api.alldebrid.com/v4/magnet/files?apikey=${config.API_KEY_ALLEDBRID}`;
  const formData = new FormData();
  formData.append("id[]", magnetId);

  try {
    console.log(`🔄 Retrieving files for magnet ID: ${magnetId}`);
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });

    if (response.data.status === "success") {
      let files = response.data.data.magnets[0].files;
      let videoFiles = [];

      // Flatten nested files in the "e" property
      files.forEach(file => {
        if (file.e && Array.isArray(file.e)) {
          // Ajoutez les fichiers imbriqués
          file.e.forEach(subFile => {
            videoFiles.push(subFile);
          });
        } else {
          videoFiles.push(file);
        }
      });

      const videoExtensions = [".mp4", ".mkv", ".avi", ".mov", ".wmv"];

      // Filter files to include only videos
      let filteredVideos = videoFiles.filter(file => {
        const fileName = file.n.toLowerCase();
        return videoExtensions.some(ext => fileName.endsWith(ext));
      });

      // Fallback to all files if no videos are found
      if (filteredVideos.length === 0 && videoFiles.length > 0) {
        filteredVideos = videoFiles;
      }

      console.log(`🎥 ${filteredVideos.length} video(s) found`);

      // Map and return the filtered video files
      return filteredVideos
        .filter(file => file.n && file.l)
        .map(file => ({
          name: file.n,
          size: file.s || 0,
          link: file.l
        }));
    } else {
      console.error("❌ Error retrieving files:", response.data.data);
      return [];
    }
  } catch (error) {
    console.error("❌ File retrieval error:", error);
    return [];
  }
}

// Unlock a link via AllDebrid
async function unlockFileLink(fileLink, config) {
  const url = "http://api.alldebrid.com/v4/link/unlock";
  const formData = new FormData();
  formData.append("link", fileLink);

  try {
    console.log(`🔄 Unlocking link: ${fileLink}`);
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });

    if (response.data.status === "success") {
      return response.data.data.link;
    } else {
      console.error("❌ Error unlocking link:", response.data.data);
      return null;
    }
  } catch (error) {
    console.error("❌ Unlock error:", error);
    return null;
  }
}

module.exports = { uploadMagnets, getFilesFromMagnetId, unlockFileLink };