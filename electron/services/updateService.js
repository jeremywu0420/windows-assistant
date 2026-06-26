'use strict';

let electronApp = null;
let electronDialog = null;
try {
  const electron = require('electron');
  electronApp = electron && electron.app ? electron.app : null;
  electronDialog = electron && electron.dialog ? electron.dialog : null;
} catch (_) {
  // Keep this module importable outside Electron for smoke tests.
}

let cachedAutoUpdater = null;

function packageVersion() {
  try {
    return require('../../package.json').version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
}

function appVersion() {
  try {
    if (electronApp && typeof electronApp.getVersion === 'function')
      return electronApp.getVersion();
  } catch (_) {
    // fall through
  }
  return packageVersion();
}

function isPackaged() {
  return !!(electronApp && electronApp.isPackaged);
}

function getAutoUpdater() {
  if (cachedAutoUpdater) return cachedAutoUpdater;
  try {
    cachedAutoUpdater = require('electron-updater').autoUpdater;
    return cachedAutoUpdater;
  } catch (_) {
    return null;
  }
}

const status = {
  state: 'idle',
  available: false,
  downloaded: false,
  version: appVersion(),
  error: null,
  progress: null,
};

let initialized = false;
let checking = false;
let getWindow = () => null;
let notify = () => {};
let log = () => {};
let onEvent = () => {};

function emit(event, payload = {}) {
  Object.assign(status, payload);
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:update-event', { event, status: { ...status } });
  }
  onEvent(event, { ...status });
}

function setup(options = {}) {
  if (initialized) return;
  initialized = true;
  getWindow = options.getWindow || getWindow;
  notify = options.notify || notify;
  log = options.log || log;
  onEvent = options.onEvent || onEvent;

  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    emit('error', {
      state: 'error',
      error: 'Auto updater is unavailable outside Electron runtime.',
    });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    checking = true;
    emit('checking', { state: 'checking', error: null });
  });

  autoUpdater.on('update-available', (info) => {
    emit('available', {
      state: 'available',
      available: true,
      downloaded: false,
      version: info.version || status.version,
      error: null,
    });
    notify('PC Life Assistant update available', `Version ${info.version} is downloading.`);
  });

  autoUpdater.on('update-not-available', (info) => {
    checking = false;
    emit('not-available', {
      state: 'idle',
      available: false,
      downloaded: false,
      version: info.version || appVersion(),
      progress: null,
      error: null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    emit('downloading', {
      state: 'downloading',
      progress: {
        percent: Math.round(progress.percent || 0),
        transferred: progress.transferred || 0,
        total: progress.total || 0,
      },
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    checking = false;
    emit('downloaded', {
      state: 'downloaded',
      available: true,
      downloaded: true,
      version: info.version || status.version,
      progress: null,
      error: null,
    });
    notify('PC Life Assistant update ready', 'Restart the app to finish updating.');

    const win = getWindow();
    const parent = win && !win.isDestroyed() ? win : undefined;
    const showMessageBox =
      electronDialog && typeof electronDialog.showMessageBox === 'function'
        ? electronDialog.showMessageBox.bind(electronDialog)
        : async () => ({ response: 1 });
    const { response } = await showMessageBox(parent, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: 'Update ready',
      message: `PC Life Assistant ${info.version || ''} is ready to install.`,
      detail:
        'Restart now to finish the update. If you choose Later, it will install when you quit the app.',
    });
    if (response === 0) install();
  });

  autoUpdater.on('error', (err) => {
    checking = false;
    const message = err && err.message ? err.message : String(err);
    emit('error', { state: 'error', error: message });
    log('error', `update failed: ${message}`);
  });
}

async function check(options = {}) {
  if (!isPackaged()) {
    return { ok: false, skipped: true, error: 'Updates are only available in the packaged app.' };
  }
  if (checking) return { ok: true, checking: true, status: { ...status } };

  try {
    const autoUpdater = getAutoUpdater();
    if (!autoUpdater) throw new Error('Auto updater is unavailable.');
    checking = true;
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, result, status: { ...status } };
  } catch (err) {
    checking = false;
    const message = err && err.message ? err.message : String(err);
    emit('error', { state: 'error', error: message });
    if (options.manual) notify('PC Life Assistant update check failed', message);
    return { ok: false, error: message, status: { ...status } };
  }
}

function install() {
  if (!status.downloaded) return { ok: false, error: 'No downloaded update is ready to install.' };
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) return { ok: false, error: 'Auto updater is unavailable.' };
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { ok: true };
}

function getStatus() {
  return {
    ok: true,
    status: { ...status, version: status.version || appVersion() },
    packaged: isPackaged(),
  };
}

module.exports = {
  setup,
  check,
  install,
  getStatus,
};
