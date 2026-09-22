const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { reconcileDue } = require('./pactDays');
const db = require('./db');
const { persistentDir } = require('./persistentDir');

// Every minute: activate due pacts, settle past-due days, send reminders.
function tick(io) {
  const { activated, settledCount, reminded } = reconcileDue(io);
  if (activated || settledCount || reminded) {
    console.log(`[cron] activated=${activated} settled=${settledCount} reminders=${reminded}`);
  }
}

// Once a day: a VACUUM INTO snapshot next to the live DB, 7 days kept.
const BACKUP_RETENTION_DAYS = 7;

function backupDatabase() {
  const dbPath = process.env.DB_PATH || path.join(persistentDir(), 'dev.db');
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(backupDir, `backup-${stamp}.db`);

  try {
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    db.prepare(`VACUUM INTO ?`).run(backupPath);

    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 3600 * 1000;
    for (const name of fs.readdirSync(backupDir)) {
      const filePath = path.join(backupDir, name);
      if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath);
    }

    console.log(`[backup] wrote ${backupPath}`);
  } catch (err) {
    console.error('[backup] failed:', err.message);
  }
}

let minuteTask = null;
let dailyTask = null;

function startCronJob(io) {
  minuteTask = cron.schedule('* * * * *', () => tick(io));
  dailyTask = cron.schedule('0 3 * * *', () => backupDatabase());
  console.log('[cron] reconciliation job scheduled (every minute), backup scheduled (daily at 03:00)');
}

function stopCronJob() {
  if (minuteTask) { minuteTask.stop(); minuteTask = null; }
  if (dailyTask) { dailyTask.stop(); dailyTask = null; }
}

module.exports = { startCronJob, stopCronJob, tick, backupDatabase };
