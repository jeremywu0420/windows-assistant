'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
let electronApp = null;
try {
  const electron = require('electron');
  electronApp = electron && electron.app ? electron.app : null;
} catch (_) {
  // Keep settings usable in Node-based smoke tests.
}

const DEFAULT_PROJECT_EXCLUDES = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'AppData',
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.cache',
  '.vscode',
  'venv',
  '.venv',
];

function safeAppPath(name, fallbackName) {
  try {
    if (electronApp && electronApp.isReady()) return electronApp.getPath(name);
  } catch (_) {
    /* fall through */
  }
  return path.join(os.homedir(), fallbackName);
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    if (!value || typeof value !== 'string') continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function defaultProjectHubSettings() {
  return {
    scanRoots: uniqueStrings([
      safeAppPath('desktop', 'Desktop'),
      safeAppPath('documents', 'Documents'),
      safeAppPath('downloads', 'Downloads'),
      safeAppPath('pictures', 'Pictures'),
      safeAppPath('videos', 'Videos'),
      safeAppPath('music', 'Music'),
      path.join(os.homedir(), 'Desktop', 'windows assistant'),
    ]),
    excludeFolders: [...DEFAULT_PROJECT_EXCLUDES],
    maxDepth: 2,
    pinnedProjects: [],
  };
}

function defaultOverlaySettings() {
  return {
    enabled: false,
    showFps: true,
    showCpu: true,
    showGpu: true,
    showRam: true,
    updateIntervalMs: 1000,
    fontSize: 14,
    opacity: 0.92,
    position: 'top-left',
    clickThrough: true,
    autoStart: false,
    displayId: 'primary',
  };
}

function createDefaultSettings() {
  return {
    general: {
      downloadsPath: '',
      monitorDrives: [],
      monitorDrive: '',
      screenshotsPath: '',
      vscodePath: '',
      autoLaunch: true,
      minimizeToTray: true,
      startMinimized: false,
      showOnStartup: true,
      showOnResume: true,
      notifications: true,
      autoUpdate: true,
      theme: 'system',
      language: 'zh',
      accentColor: '#4f8cff',
      compactMode: false,
      watchEnabled: true,
      watchFolders: [],
      projectScanRoots: [],
      automationsEnabled: true,
      askBeforeOrganizing: true,
      keepHistory: true,
      firstRunCompleted: false,
      lastSetupCheckAt: '',
    },
    projectHub: defaultProjectHubSettings(),
    cleanup: {
      enabledCategories: [],
      lastScanAt: '',
    },
    healthGuard: {
      enabled: true,
      mode: 'normal',
      intervalMinutes: 5,
      cooldownMinutes: 30,
      cpuTempC: 85,
      gpuTempC: 85,
      ramPercent: 85,
      diskFreeGb: 50,
      diskFreePercent: 15,
    },
    overlay: defaultOverlaySettings(),
    ui: {
      dismissedHints: [],
    },
    modes: [],
    projects: [],
    rules: [],
    automations: [],
    history: [],
    cheatsheet: [],
    screenshots: {
      path: '',
      keywords: {},
      organizer: {
        organizeByDate: true,
        categoryUnderDate: true,
        renameConflicts: true,
        skipAlreadyOrganized: true,
        includeSubfolders: false,
        includeHiddenFiles: false,
        showFullPaths: false,
      },
    },
  };
}

const DEFAULT_SETTINGS = createDefaultSettings();

function bundledConfigDir() {
  if (electronApp && electronApp.isPackaged) {
    return path.join(process.resourcesPath, 'config');
  }
  return path.join(__dirname, '..', '..', 'config');
}

// Seed source for a fresh config. The real `user-settings.json` is git-ignored
// (it holds personal paths), so on a clean checkout / packaged build only the
// sanitized `user-settings.example.json` template exists — fall back to it.
function bundledConfigPath() {
  const dir = bundledConfigDir();
  const primary = path.join(dir, 'user-settings.json');
  if (fs.existsSync(primary)) return primary;
  const example = path.join(dir, 'user-settings.example.json');
  if (fs.existsSync(example)) return example;
  return primary;
}

function activeConfigPath() {
  if (electronApp && electronApp.isPackaged) {
    return path.join(electronApp.getPath('userData'), 'user-settings.json');
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
        fs.writeFileSync(target, JSON.stringify(createDefaultSettings(), null, 2), 'utf-8');
      }
    }
  } catch (err) {
    console.error('[settingsService] ensureConfigExists failed:', err);
  }
}

function normalizeProjectHub(parsed, defaults) {
  const incoming = parsed.projectHub && typeof parsed.projectHub === 'object' ? parsed.projectHub : null;
  const legacyRoots = parsed.general && Array.isArray(parsed.general.projectScanRoots)
    ? parsed.general.projectScanRoots
    : [];

  if (!incoming) {
    return {
      ...defaults.projectHub,
      scanRoots: uniqueStrings([...defaults.projectHub.scanRoots, ...legacyRoots]),
    };
  }

  return {
    ...defaults.projectHub,
    ...incoming,
    scanRoots: Array.isArray(incoming.scanRoots)
      ? uniqueStrings(incoming.scanRoots)
      : uniqueStrings([...defaults.projectHub.scanRoots, ...legacyRoots]),
    excludeFolders: Array.isArray(incoming.excludeFolders)
      ? uniqueStrings(incoming.excludeFolders)
      : defaults.projectHub.excludeFolders,
    maxDepth: Number.isFinite(Number(incoming.maxDepth))
      ? Number(incoming.maxDepth)
      : defaults.projectHub.maxDepth,
    pinnedProjects: Array.isArray(incoming.pinnedProjects)
      ? incoming.pinnedProjects
      : defaults.projectHub.pinnedProjects,
  };
}

function normalizeOverlay(parsed, defaults) {
  const incoming = parsed.overlay && typeof parsed.overlay === 'object' ? parsed.overlay : {};
  const interval = Number(incoming.updateIntervalMs);
  const fontSize = Number(incoming.fontSize);
  const opacity = Number(incoming.opacity);
  const positions = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

  return {
    ...defaults.overlay,
    ...incoming,
    enabled: incoming.enabled === true,
    showFps: incoming.showFps !== false,
    showCpu: incoming.showCpu !== false,
    showGpu: incoming.showGpu !== false,
    showRam: incoming.showRam !== false,
    updateIntervalMs: Number.isFinite(interval) ? Math.max(500, Math.min(5000, Math.round(interval))) : defaults.overlay.updateIntervalMs,
    fontSize: Number.isFinite(fontSize) ? Math.max(10, Math.min(28, Math.round(fontSize))) : defaults.overlay.fontSize,
    opacity: Number.isFinite(opacity) ? Math.max(0.35, Math.min(1, opacity)) : defaults.overlay.opacity,
    position: positions.has(incoming.position) ? incoming.position : defaults.overlay.position,
    clickThrough: incoming.clickThrough !== false,
    autoStart: incoming.autoStart === true,
    displayId: typeof incoming.displayId === 'string' && incoming.displayId.trim() ? incoming.displayId : defaults.overlay.displayId,
  };
}

function mergeSettings(parsed) {
  const defaults = createDefaultSettings();
  return {
    ...defaults,
    ...parsed,
    general: { ...defaults.general, ...(parsed.general || {}) },
    cleanup: {
      ...defaults.cleanup,
      ...(parsed.cleanup || {}),
      enabledCategories: Array.isArray((parsed.cleanup || {}).enabledCategories)
        ? parsed.cleanup.enabledCategories
        : defaults.cleanup.enabledCategories,
    },
    healthGuard: {
      ...defaults.healthGuard,
      ...(parsed.healthGuard || {}),
    },
    overlay: normalizeOverlay(parsed, defaults),
    ui: {
      ...defaults.ui,
      ...(parsed.ui || {}),
      dismissedHints: Array.isArray((parsed.ui || {}).dismissedHints)
        ? parsed.ui.dismissedHints
        : defaults.ui.dismissedHints,
    },
    projectHub: normalizeProjectHub(parsed, defaults),
    modes: Array.isArray(parsed.modes) ? parsed.modes : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    rules: Array.isArray(parsed.rules) ? parsed.rules : [],
    automations: Array.isArray(parsed.automations) ? parsed.automations : [],
    history: Array.isArray(parsed.history) ? parsed.history : [],
    screenshots: {
      ...defaults.screenshots,
      ...(parsed.screenshots || {}),
      organizer: {
        ...defaults.screenshots.organizer,
        ...(((parsed.screenshots || {}).organizer) || {}),
      },
    },
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
    let recovered = false;
    let backupPath = null;
    try {
      backupPath = `${target}.corrupt-${Date.now()}.json`;
      if (fs.existsSync(target)) fs.renameSync(target, backupPath);
      fs.writeFileSync(target, JSON.stringify(createDefaultSettings(), null, 2), 'utf-8');
      recovered = true;
    } catch (rebuildErr) {
      console.error('[settingsService] rebuild after corruption failed:', rebuildErr);
    }
    return {
      ok: recovered,
      path: target,
      error: `Settings JSON was corrupt. Backup: ${backupPath || '(backup failed)'}. ${err.message}`,
      recovered,
      backupPath,
      settings: createDefaultSettings(),
    };
  }
}

function saveSettings(newSettings) {
  const target = activeConfigPath();
  try {
    const serialised = JSON.stringify(newSettings, null, 2);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialised, 'utf-8');
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, path: target, error: `Could not save settings: ${err.message}` };
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  createDefaultSettings,
  defaultOverlaySettings,
  defaultProjectHubSettings,
  activeConfigPath,
  getSettings,
  saveSettings,
  mergeSettings,
};
