const axios = require('axios');
const FormData = require('form-data');

// Upload magnets via AllDebrid
async function uploadMagnets(magnets, config) {
  const url = `https://api.alldebrid.com/v4/magnet/upload?apikey=${config.API_KEY_ALLEDBRID}`;
  const formData = new FormData();
  magnets.forEach(m => formData.append("magnets[]", m.hash));
  try {
    console.log("🔄 Uploading magnets to AllDebrid...");
    const response = await axios.post(url, formData, {
      headers: {
        "Authorization": `Bearer ${config.API_KEY_ALLEDBRID}`,
        ...formData.getHeaders()
      }
    });
    if (response.data.status === "success") {
      return response.data.data.magnets.map(magnetData => ({
        hash: magnetData.hash,
        ready: magnetData.ready ? '✅ Ready' : '❌ Not ready',
        name: magnetData.name,
        size: magnetData.size,
        id: magnetData.id
      }));
    } else {
      console.error("❌ Magnet Upload Error:", response.data.data);
      return [];
    }
  } catch (error) {
    console.error("❌ Magnet Upload Error:", error);
    return [];
  }
}

// Retrieve video files for a magnet via AllDebrid
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
      files.forEach(file => {
        if (file.e && Array.isArray(file.e)) {
          videoFiles = videoFiles.concat(file.e);
        } else {
          videoFiles.push(file);
        }
      });
      const videoExtensions = [".mp4", ".mkv", ".avi", ".mov", ".wmv"];
      let filteredVideos = videoFiles.filter(file => {
        const fileName = file.n.toLowerCase();
        return videoExtensions.some(ext => fileName.endsWith(ext));
      });
      if (filteredVideos.length === 0 && videoFiles.length > 0) {
        filteredVideos = videoFiles;
      }
      console.log(`🎥 ${filteredVideos.length} video(s) found`);
      return filteredVideos.map(file => ({
        name: file.n,
        size: file.s,
        link: file.l
      }));
    } else {
      console.error("❌ File Retrieval Error:", response.data.data);
      return [];
    }
  } catch (error) {
    console.error("❌ File Retrieval Error:", error);
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
      console.error("❌ Unlock Error:", response.data.data);
      return null;
    }
  } catch (error) {
    console.error("❌ Unlock Error:", error);
    return null;
  }
}

module.exports = { uploadMagnets, getFilesFromMagnetId, unlockFileLink };