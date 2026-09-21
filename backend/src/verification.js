const bcrypt = require('bcryptjs');

const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const UNVERIFIED_TTL_HOURS = 24;

function generateCode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(CODE_LENGTH, '0');
}

async function hashCode(code) {
  return bcrypt.hash(code, 8);
}

async function compareCode(code, hash) {
  if (!hash) return false;
  return bcrypt.compare(code, hash);
}

function expiryTimestamp() {
  return new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();
}

function isExpired(expiresAtIso) {
  if (!expiresAtIso) return true;
  return new Date(expiresAtIso).getTime() < Date.now();
}

module.exports = {
  CODE_LENGTH,
  EXPIRY_MINUTES,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  UNVERIFIED_TTL_HOURS,
  generateCode,
  hashCode,
  compareCode,
  expiryTimestamp,
  isExpired,
};
