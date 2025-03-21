const express = require('express');
const https = require('https');
const fs = require('fs');
const manifestRoutes = require('./routes/manifest');
const streamRoutes = require('./routes/stream');
const configRoutes = require('./routes/config');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Routes
app.use('/', configRoutes);
app.use('/', manifestRoutes);
app.use('/', streamRoutes);

// Start the HTTPS server
const sslOptions = {
  key: fs.readFileSync('/etc/ssl/private/server.key'),
  cert: fs.readFileSync('/etc/ssl/certs/server.pem')
};

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`✅ HTTPS server running on https://0-0-0-0.local-ip.sh:${PORT}`);
});