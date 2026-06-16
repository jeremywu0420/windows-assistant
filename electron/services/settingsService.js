'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Settings service.
 *
 * - In development we read/write ./config/user-settings.json directly so it is
 *   easy to inspect and edit while coding.
 * - In a packaged app the bundled config is read-only (inside resources/), so on
 *   first launch we copy it into the writable userData directory and use that.
 */

const DEFAULT_SETTINGS = {
  general: {
    downloadsPath: '',
    monitorDrives: [],
    monitorDrive: '', // legacy single-drive field (kept for backward compatibility)
    screenshotsPath: '',
    vscodePath: '',
    // General preferences
    autoLaunch: true,
    minimizeToTray: true,
    startMinimized: false,
    notifications: true,
    // Appearance
    theme: 'system', // 'system' | 'light' | 'dark'
    accentColor: '#4f8cff',
    compactMode: false,
    // Watching / automation
    watchEnabled: true,
    watchFolders: [],
    automationsEnabled: true,
    askBeforeOrganizing: true,
    keepHistory: true,
  },
  modes: [],
  projects: [],
  rules: [],
  automations: [],
  history: [],
  screenshots: {
    path: '',
    keywords: {},
  },
};

function bundledConfigPath() {
  // Packaged: resources/config/user-settings.json (see extraResources in package.json)
  // Dev: <projectRoot>/config/user-settings.json
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'config', 'user-settings.json');
  }
  return path.join(__dirname, '..', '..', 'config', 'user-settings.json');
}

function activeConfigPath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'user-settings.json');
  }
  return path.join(__dirname, '..', '..', 'config', 'user-settings.json');
}

function ensureConfigExists() {
  const target = activeConfigPath();
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const source = bundledConfigPath();
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, target);
      } else {
        fs.writeFileSync(target, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
      }
    }
  } catch (err) {
    console.error('[settingsService] ensureConfigExists failed:', err);
  }
}

function mergeSettings(parsed) {
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    general: { ...DEFAULT_SETTINGS.general, ...(parsed.general || {}) },
    modes: Array.isArray(parsed.modes) ? parsed.modes : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    rules: Array.isArray(parsed.rules) ? parsed.rules : [],
    automations: Array.isArray(parsed.automations) ? parsed.automations : [],
    history: Array.isArray(parsed.history) ? parsed.history : [],
    screenshots: { ...DEFAULT_SETTINGS.screenshots, ...(parsed.screenshots || {}) },
  };
}

function getSettings() {
  ensureConfigExists();
  const target = activeConfigPath();
  try {
    const raw = fs.readFileSync(target, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ok: true, path: target, settings: mergeSettings(parsed) };
  } catch (err) {
    // Corrupt settings: back up the bad file and recreate defaults so the app
    // keeps working instead of failing to start.
    let recovered = false;
    let backupPath = null;
    try {
      backupPath = `${target}.corrupt-${Date.now()}.json`;
      if (fs.existsSync(target)) fs.renameSync(target, backupPath);
      fs.writeFileSync(target, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
      recovered = true;
    } catch (rebuildErr) {
      console.error('[settingsService] rebuild after corruption failed:', rebuildErr);
    }
    return {
      ok: recovered,
      path: target,
      error: `設定檔損毀，已備份為 ${backupPath || '(備份失敗)'} 並重建預設值（原因：${err.message}）`,
      recovered,
      backupPath,
      settings: { ...DEFAULT_SETTINGS },
    };
  }
}

function saveSettings(newSettings) {
  const target = activeConfigPath();
  try {
    // Validate it is serialisable / well formed before writing.
    const serialised = JSON.stringify(newSettings, null, 2);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialised, 'utf-8');
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, path: target, error: `設定檔儲存失敗：${err.message}` };
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  activeConfigPath,
  getSettings,
  saveSettings,
};
