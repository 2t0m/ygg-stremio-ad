const express = require('express');
const router = express.Router();
const { getConfig } = require('../utils/helpers');

// Serve the manifest file
router.get('/:variables/manifest.json', (req, res) => {
  let config;

  // Retrieve configuration
  try {
    config = getConfig(req);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // Define the manifest object
  const manifest = {
    id: 'ygg.stremio.ad',
    version: '0.0.3',
    name: 'Ygg + AD',
    description: 'An addon to access YggTorrent torrents cached on AllDebrid (thanks to Ygg API).',
    types: ['movie', 'series'],
    resources: ['stream'],
    catalogs: [],
    behaviorHints: {
      configurable: true
    }
  };

  // Send the manifest as a JSON response
  res.json(manifest);
});

module.exports = router;