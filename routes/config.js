const express = require('express');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../utils/helpers');

const router = express.Router();

// Serve the static configuration page
router.get('/config', (req, res) => {
  const configPath = path.join(__dirname, '../public/config.html');

  res.sendFile(configPath, (err) => {
    if (err) {
      console.error("❌ Error serving the configuration page:", err.message);
      res.status(500).send("Error loading configuration page.");
    }
  });
});

// Serve the dynamic configuration page
router.get('/:variables/configure', (req, res) => {
  let config;

  // Retrieve configuration
  try {
    config = getConfig(req);
  } catch (e) {
    return res.status(400).send("Invalid configuration!");
  }

  const configPath = path.join(__dirname, '../public/config.html');

  // Read and process the HTML file
  fs.readFile(configPath, 'utf8', (err, data) => {
    if (err) {
      console.error("❌ Error reading the configuration page:", err.message);
      return res.status(500).send("Error loading configuration page.");
    }

    // Replace placeholders in the HTML with configuration values
    const page = data
      .replace(/{{TMDB_API_KEY}}/g, config.TMDB_API_KEY || '')
      .replace(/{{API_KEY_ALLEDBRID}}/g, config.API_KEY_ALLEDBRID || '')
      .replace(/{{FILES_TO_SHOW}}/g, config.FILES_TO_SHOW || 5)
      .replace(/{{RES_TO_SHOW}}/g, config.RES_TO_SHOW ? config.RES_TO_SHOW.join(', ') : '')
      .replace(/{{LANG_TO_SHOW}}/g, config.LANG_TO_SHOW ? config.LANG_TO_SHOW.join(', ') : '');

    res.send(page);
  });
});

module.exports = router;