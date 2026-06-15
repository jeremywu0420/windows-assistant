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
  },
  modes: [],
  projects: [],
  rules: [],
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

function getSettings() {
  ensureConfigExists();
  const target = activeConfigPath();
  try {
    const raw = fs.readFileSync(target, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      path: target,
      settings: {
        ...DEFAULT_SETTINGS,
        ...parsed,
        general: { ...DEFAULT_SETTINGS.general, ...(parsed.general || {}) },
        modes: Array.isArray(parsed.modes) ? parsed.modes : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        rules: Array.isArray(parsed.rules) ? parsed.rules : [],
        screenshots: { ...DEFAULT_SETTINGS.screenshots, ...(parsed.screenshots || {}) },
      },
    };
  } catch (err) {
    return {
      ok: false,
      path: target,
      error: `設定檔讀取失敗：${err.message}`,
      settings: DEFAULT_SETTINGS,
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
