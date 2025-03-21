// Format file size from bytes to GB
function formatSize(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb.toFixed(2) + " GB";
}

// Extract resolution, codec, and source from a file name
function parseFileName(fileName) {
  const resolutionMatch = fileName.match(/(4k|\d{3,4}p)/i);
  const codecMatch = fileName.match(/(h.264|h.265|x.264|x.265|h264|h265|x264|x265|AV1|HEVC)/i);
  const sourceMatch = fileName.match(/(BluRay|WEB[-]?DL|WEB|HDRip|DVDRip|BRRip)/i);

  return {
    resolution: resolutionMatch ? resolutionMatch[0] : "?",
    codec: codecMatch ? codecMatch[0] : "?",
    source: sourceMatch ? sourceMatch[0] : "?"
  };
}

// Decode and parse configuration from the request
function getConfig(req) {
  if (req.params.variables) {
    try {
      const decoded = Buffer.from(req.params.variables, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (e) {
      throw new Error("Invalid configuration in URL");
    }
  } else {
    throw new Error("Configuration missing in URL");
  }
}

module.exports = { formatSize, parseFileName, getConfig };