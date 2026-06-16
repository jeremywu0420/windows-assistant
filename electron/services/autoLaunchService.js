'use strict';

const { app } = require('electron');

/**
 * Auto-launch (start at login) service.
 * Only registers for the packaged app on Windows so we never add the dev
 * Electron binary to the user's startup.
 */

function isSupported() {
  return process.platform === 'win32' && app.isPackaged;
}

function apply(enabled) {
  if (!isSupported()) return { supported: false };
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      enabled: !!enabled,
      path: process.execPath,
      args: ['--hidden'],
    });
    return { supported: true };
  } catch (err) {
    return { supported: true, error: err.message };
  }
}

function getOpenAtLogin() {
  try {
    return isSupported() ? app.getLoginItemSettings().openAtLogin : null;
  } catch (_) {
    return null;
  }
}

module.exports = { isSupported, apply, getOpenAtLogin };
