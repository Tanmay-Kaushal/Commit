const path = require('path');

// Railway auto-provides RAILWAY_VOLUME_MOUNT_PATH once a volume is
// attached — no env var needs setting by hand for that. Falls back to
// the backend folder itself for local dev.
function persistentDir() {
  return process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..');
}

module.exports = { persistentDir };
