'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

function userDataPath(fileName) {
  try {
    if (app && app.isReady()) return path.join(app.getPath('userData'), fileName);
  } catch (_) {
    /* fall through */
  }
  return path.join(os.tmpdir(), 'pc-life-assistant', fileName);
}

function screenshotLogPath() {
  return userDataPath('screenshot-organizer-history.json');
}

async function readOrganizerLogs() {
  const target = screenshotLogPath();
  try {
    const raw = await fs.promises.readFile(target, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    return [];
  }
}

async function writeOrganizerLog(result) {
  const target = screenshotLogPath();
  const logs = await readOrganizerLogs();
  const entry = {
    time: result.time || new Date().toISOString(),
    mode: 'screenshot-organizer',
    items: Array.isArray(result.items) ? result.items : [],
  };

  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(
    target,
    JSON.stringify([entry, ...logs].slice(0, 50), null, 2),
    'utf-8',
  );
  return { path: target, entry };
}

module.exports = {
  screenshotLogPath,
  readOrganizerLogs,
  writeOrganizerLog,
};
