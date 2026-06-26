'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let ElectronNotification = null;
let electronApp = null;
try {
  const electron = require('electron');
  ElectronNotification = electron && electron.Notification ? electron.Notification : null;
  electronApp = electron && electron.app ? electron.app : null;
} catch (_) {
  // Keep service importable outside Electron.
}

const MAX_EVENTS = 300;

function userDataPath(fileName) {
  try {
    if (electronApp && electronApp.isReady())
      return path.join(electronApp.getPath('userData'), fileName);
  } catch (_) {
    // fall through
  }
  return path.join(os.tmpdir(), 'pc-life-assistant', fileName);
}

function notificationPath() {
  return userDataPath('notification-center.json');
}

async function readEvents() {
  const target = notificationPath();
  try {
    const raw = await fs.promises.readFile(target, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeEvents(events) {
  const target = notificationPath();
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(
    target,
    JSON.stringify(events.slice(0, MAX_EVENTS), null, 2),
    'utf-8',
  );
  return target;
}

async function addEvent(event = {}) {
  const events = await readEvents();
  const next = {
    id: event.id || `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: event.time || new Date().toISOString(),
    title: event.title || 'PC Life Assistant',
    body: event.body || '',
    level: event.level || 'info',
    source: event.source || 'app',
    action: event.action || null,
    read: !!event.read,
    details: event.details || null,
  };
  await writeEvents([next, ...events]);
  return next;
}

function showNative(title, body) {
  try {
    if (!ElectronNotification || !ElectronNotification.isSupported()) {
      return { ok: false, error: '此系統不支援桌面通知' };
    }
    const notification = new ElectronNotification({
      title: title || 'PC Life Assistant',
      body: body || '',
    });
    notification.show();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function notify(title, body, options = {}) {
  const level = options.level || 'info';
  addEvent({
    title,
    body,
    level,
    source: options.source || 'system',
    action: options.action || null,
    details: options.details || null,
  }).catch(() => {});
  return showNative(title, body);
}

async function listEvents() {
  const events = await readEvents();
  return {
    ok: true,
    path: notificationPath(),
    events,
    unreadCount: events.filter((event) => !event.read).length,
  };
}

async function markRead(id) {
  const events = await readEvents();
  const next = events.map((event) => (id && event.id !== id ? event : { ...event, read: true }));
  await writeEvents(next);
  return { ok: true, events: next };
}

async function clearEvents() {
  await writeEvents([]);
  return { ok: true, path: notificationPath(), events: [] };
}

module.exports = {
  notify,
  showNative,
  addEvent,
  listEvents,
  markRead,
  clearEvents,
  notificationPath,
};
