'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, globalShortcut, dialog, powerMonitor } = require('electron');

const settingsService = require('./services/settingsService');
const systemMonitorService = require('./services/systemMonitorService');
const fileOrganizerService = require('./services/fileOrganizerService');
const downloadService = require('./services/downloadService');
const gitService = require('./services/gitService');
const modeService = require('./services/modeService');
const projectService = require('./services/projectService');
const commandService = require('./services/commandService');
const ruleService = require('./services/ruleService');
const screenshotService = require('./services/screenshotService');
const autoLaunchService = require('./services/autoLaunchService');
const notificationService = require('./services/notificationService');
const fileWatcherService = require('./services/fileWatcherService');
const automationService = require('./services/automationService');
const updateService = require('./services/updateService');
const cleanupService = require('./services/cleanupService');
const activityHistoryService = require('./services/activityHistoryService');
const healthGuardService = require('./services/healthGuardService');
const toolchainService = require('./services/toolchainService');
const buildService = require('./services/buildService');
const serialService = require('./services/serialService');

const isDev = !app.isPackaged;

// In-memory record of the last organize batch (for undo).
let lastOrganizeBatch = null;

// --- Minimal file logger (errors are appended to <userData>/logs/app.log) ---
function logsDir() {
  return path.join(app.getPath('userData'), 'logs');
}
function writeLog(level, message) {
  try {
    const dir = logsDir();
    fs.mkdirSync(dir, { recursive: true });
    const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    fs.appendFileSync(path.join(dir, 'app.log'), line, 'utf-8');
  } catch (_) {
    /* never let logging crash the app */
  }
}

// Catch otherwise-unhandled errors so they are logged instead of silently crashing the app.
process.on('uncaughtException', (err) => {
  writeLog('error', `uncaughtException: ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (reason) => {
  writeLog('error', `unhandledRejection: ${reason && reason.stack ? reason.stack : reason}`);
});

// Returns true only when p is a non-empty string pointing at an existing directory.
// Used to validate user-supplied folder paths arriving over IPC before touching the fs.
function isUsableDir(p) {
  try {
    return typeof p === 'string' && p.trim() !== '' && fs.statSync(p).isDirectory();
  } catch (_) {
    return false;
  }
}

// True when the app was launched by Windows at login (we pass --hidden then).
const startedHidden = process.argv.includes('--hidden');

let mainWindow = null;
let tray = null;
app.isQuitting = false;
let lastUserInactiveAt = 0;
let lastWakeShowAt = 0;

// Ensure only a single instance runs (so the tray icon isn't duplicated).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Sync the OS start-at-login state with the user's saved preference at startup.
function configureAutoLaunch() {
  const config = loadConfig();
  const enabled = !(config.general && config.general.autoLaunch === false);
  autoLaunchService.apply(enabled);
}

// --- File monitoring (watcher → notifications + automations + renderer event) ---
function monitorFolders(config) {
  const g = (config && config.general) || {};
  const folders = [];
  if (g.downloadsPath) folders.push(g.downloadsPath);
  if (g.screenshotsPath) folders.push(g.screenshotsPath);
  if (Array.isArray(g.watchFolders)) folders.push(...g.watchFolders.filter(Boolean));
  if (Array.isArray(config && config.automations)) {
    config.automations.forEach((rule) => {
      const folder = rule && rule.enabled !== false && rule.condition && rule.condition.folder;
      if (folder) folders.push(folder);
    });
  }
  return folders;
}

async function onNewFile(info) {
  try {
    const config = loadConfig();
    const g = config.general || {};
    if (g.notifications !== false) {
      notificationService.notify('偵測到新檔案', `${info.file}（${path.basename(info.folder)}）`);
    }
    if (g.automationsEnabled !== false) {
      const fired = await automationService.handleNewFile(config, info);
      if (fired.length) writeLog('info', `automation fired for ${info.file}: ${JSON.stringify(fired)}`);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:file-event', { file: info.file, folder: info.folder });
    }
  } catch (err) {
    writeLog('error', `onNewFile failed: ${err.message}`);
  }
}

function startMonitoring() {
  const config = loadConfig();
  const enabled = config.general && config.general.watchEnabled !== false;
  if (!enabled) {
    fileWatcherService.stop();
    return;
  }
  fileWatcherService.setPaused(false);
  fileWatcherService.start(monitorFolders(config), onNewFile);
}

function startBackgroundServices() {
  const getConfig = () => loadConfig();
  healthGuardService.start(getConfig, { runNow: true });
  automationService.startScheduler(getConfig, (fired) => {
    writeLog('info', `scheduled automations fired: ${JSON.stringify(fired)}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:automation-fired', fired);
    }
  });
}

function recordHistory(batch) {
  // Persist a compact history entry (for the dashboard) when enabled.
  try {
    const res = settingsService.getSettings();
    const cfg = res.settings;
    if (cfg.general && cfg.general.keepHistory === false) return;
    const moved = (batch.results || []).filter((r) => r.status === 'moved');
    const entry = {
      at: new Date().toISOString(),
      moved: batch.moved,
      failed: batch.failed,
      sample: moved.slice(0, 5).map((r) => r.name),
    };
    const history = [entry, ...(Array.isArray(cfg.history) ? cfg.history : [])].slice(0, 20);
    settingsService.saveSettings({ ...cfg, history });
  } catch (err) {
    writeLog('error', `recordHistory failed: ${err.message}`);
  }
}

function getTrayIconPath() {
  const candidate = path.join(__dirname, 'assets', 'tray-icon.png');
  if (fs.existsSync(candidate)) return candidate;
  // Fall back to the app icon if the tray icon was not generated.
  const fallback = isDev
    ? path.join(__dirname, '..', 'build', 'icon.png')
    : path.join(process.resourcesPath, 'icon.png');
  return fallback;
}

function loadConfig() {
  const res = settingsService.getSettings();
  return res.settings || settingsService.DEFAULT_SETTINGS;
}

function createWindow(showOnReady = true) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (showOnReady) {
      bringWindowToFront(mainWindow);
    }
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: false,
    backgroundColor: '#0f172a',
    icon: getTrayIconPath(),
    title: 'PC Life Assistant',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.removeMenu();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    // When launched at login (--hidden) we stay in the tray and don't pop the window.
    if (showOnReady) mainWindow.show();
  });

  // Close button minimises to the system tray instead of quitting (configurable).
  mainWindow.on('close', (event) => {
    const cfg = loadConfig();
    const minimizeToTray = !(cfg.general && cfg.general.minimizeToTray === false);
    if (!app.isQuitting && minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  return mainWindow;
}

function bringWindowToFront(win, aggressive = false) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.moveTop();
  win.focus();
  if (aggressive) {
    try {
      win.setAlwaysOnTop(true, 'screen-saver');
      win.show();
      win.focus();
      setTimeout(() => {
        if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
      }, 900);
    } catch (err) {
      writeLog('warn', `bringWindowToFront aggressive focus failed: ${err.message}`);
    }
    win.flashFrame(true);
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.flashFrame(false);
    }, 2500);
  }
}

function showWindow(navigateTo, options = {}) {
  const win = createWindow();
  bringWindowToFront(win, !!options.aggressive);
  if (navigateTo) {
    const send = () => win.webContents.send('app:navigate', navigateTo);
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }
}

function shouldShowAfterWake() {
  const latest = loadConfig();
  return !(latest.general && latest.general.showOnResume === false);
}

function showWindowAfterWake(reason) {
  if (!shouldShowAfterWake()) return;
  const now = Date.now();
  if (now - lastWakeShowAt < 5000) return;
  lastWakeShowAt = now;
  writeLog('info', `showing dashboard after wake event: ${reason}`);
  showWindow('dashboard', { aggressive: true });
}

async function runProgrammingModeFromTray() {
  try {
    const config = loadConfig();
    const result = await modeService.runMode(config, config.modes[0] ? config.modes[0].name : null);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:mode-result', result);
    }
  } catch (err) {
    console.error('[main] tray run mode failed:', err);
  }
}

function buildTrayMenu() {
  const paused = fileWatcherService.isPaused();
  const updates = updateService.getStatus().status;
  return Menu.buildFromTemplate([
    { label: 'Open PC Life Assistant', click: () => showWindow('dashboard') },
    { label: 'Organize Downloads', click: () => showWindow('downloads') },
    {
      label: paused ? 'Resume Monitoring' : 'Pause Monitoring',
      click: () => {
        fileWatcherService.setPaused(!paused);
        refreshTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:monitoring-changed', { paused: !paused });
        }
      },
    },
    { label: 'Settings', click: () => showWindow('settings') },
    {
      label: updates.downloaded ? 'Restart to Update' : 'Check for Updates',
      click: async () => {
        if (updates.downloaded) {
          updateService.install();
          return;
        }
        const res = await updateService.check({ manual: true });
        if (res.skipped) {
          notificationService.notify('PC Life Assistant', res.error);
        } else if (!res.ok) {
          notificationService.notify('PC Life Assistant update failed', res.error || 'Update check failed.');
        } else {
          const latest = updateService.getStatus().status;
          if (!latest.available && latest.state === 'idle') {
            notificationService.notify('PC Life Assistant', 'You are already on the latest version.');
          }
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  const iconPath = getTrayIconPath();
  let image = nativeImage.createFromPath(iconPath);
  if (process.platform === 'win32' && !image.isEmpty()) {
    image = image.resize({ width: 16, height: 16 });
  }
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('PC Life Assistant');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => showWindow('dashboard'));
}

// ---------------------------------------------------------------------------
// IPC handlers (clearly namespaced: <domain>:<action>)
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('system:getStatus', async () => {
    try {
      const config = loadConfig();
      const metrics = await systemMonitorService.getMetrics({
        monitorDrives: config.general && config.general.monitorDrives,
        monitorDrive: config.general && config.general.monitorDrive,
      });
      const downloadsPath = await fileOrganizerService.resolveDownloadsPath(
        config.general && config.general.downloadsPath
      );
      const unsorted = fileOrganizerService.countUnsorted(downloadsPath);
      const git = await gitService.checkAll(config.projects);
      const health = systemMonitorService.computeHealthScore(metrics, {
        unsortedDownloads: unsorted.count,
        hasStaleProject: git.hasStaleProject,
      });
      const rules = ruleService.evaluate(config, {
        downloadsCount: unsorted.count,
        ramPercent: metrics.memory.usagePercent,
        disks: (metrics.disks || []).map((d) => ({
          drive: d.drive,
          freePercent: d.freePercent,
          ok: d.ok,
        })),
        projects: (git.projects || []).map((p) => ({
          name: p.name,
          hoursSinceCommit: p.hoursSinceCommit,
        })),
      });
      return {
        ok: true,
        metrics,
        downloads: unsorted,
        git,
        health,
        rules,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('mode:list', async () => {
    const config = loadConfig();
    return { ok: true, modes: modeService.listModes(config) };
  });

  ipcMain.handle('mode:run', async (_event, modeName) => {
    const config = loadConfig();
    return modeService.runMode(config, modeName, {
      // Let the user decide when a dev server is already running on the port.
      onDevServerRunning: async ({ port, isOwn, command }) => {
        const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        const { response } = await dialog.showMessageBox(parent, {
          type: 'question',
          buttons: ['略過（建議）', '仍要新開'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          title: '開發伺服器已在執行',
          message: isOwn
            ? `localhost:${port} 已在執行（本專案）。`
            : `localhost:${port} 已被其他程式佔用（不是本專案）。`,
          detail: `指令：${command}\n要略過，還是仍要強制再開一個？`,
        });
        return response === 1 ? 'launch' : 'skip';
      },
    });
  });

  ipcMain.handle('downloads:getDefaultPath', async () => fileOrganizerService.getDefaultPath());
  ipcMain.handle('downloads:detect', async () => fileOrganizerService.detectDownloads());
  ipcMain.handle('downloads:getSettings', async () => fileOrganizerService.getSettings());
  ipcMain.handle('downloads:saveSettings', async (_event, settings) => fileOrganizerService.saveSettings(settings));

  ipcMain.handle('downloads:selectFolder', async () => {
    try {
      const current = await fileOrganizerService.getSettings();
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select folder to organize',
        defaultPath: current.ok && current.settings.folderPath ? current.settings.folderPath : undefined,
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
      const saved = await fileOrganizerService.saveSettings({
        ...(current.settings || {}),
        folderPath: result.filePaths[0],
      });
      return { ok: saved.ok, path: result.filePaths[0], settings: saved.settings, error: saved.error };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('downloads:scan', async (_event, payload = {}) => {
    const settings = payload.settings || {};
    const folderPath = payload.folderPath || settings.folderPath || '';
    // Empty path is valid (the service auto-detects Downloads); reject only a bad explicit path.
    if (folderPath && !isUsableDir(folderPath)) {
      return { ok: false, error: `資料夾不存在或無效：${folderPath}` };
    }
    return fileOrganizerService.scan(folderPath, settings);
  });

  ipcMain.handle('downloads:organize', async (_event, payload = {}) => {
    const items = Array.isArray(payload) ? payload : payload.items;
    if (!Array.isArray(items)) return { ok: false, moved: 0, copied: 0, failed: 0, results: [], error: 'Invalid organize items.' };
    const result = await fileOrganizerService.organize(items, payload.settings || {});
    lastOrganizeBatch = result.results || [];
    recordHistory(result);
    return result;
  });

  ipcMain.handle('downloads:restoreLast', async () => fileOrganizerService.restoreLast());
  ipcMain.handle('downloads:undo', async () => fileOrganizerService.restoreLast());
  ipcMain.handle('downloads:getHistory', async () => fileOrganizerService.getHistory());
  ipcMain.handle('downloads:openHistory', async () => {
    try {
      const history = await fileOrganizerService.getHistory();
      const err = await shell.openPath(history.path);
      return err ? { ok: false, path: history.path, error: err } : { ok: true, path: history.path };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('downloads:openFolder', async (_event, folderPath) => {
    try {
      const p = folderPath || await fileOrganizerService.resolveDownloadsPath();
      const err = await shell.openPath(p);
      return err ? { ok: false, error: err } : { ok: true, path: p };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Backward-compatible aliases used by older renderer code.
  ipcMain.handle('files:scan', async () => {
    const settings = await fileOrganizerService.getSettings();
    return fileOrganizerService.scan(settings.settings.folderPath, settings.settings);
  });

  ipcMain.handle('files:organize', async (_event, items) => {
    if (!Array.isArray(items)) return { ok: false, moved: 0, copied: 0, failed: 0, results: [], error: 'Invalid organize items.' };
    return fileOrganizerService.organize(items);
  });
  ipcMain.handle('git:check', async () => {
    const config = loadConfig();
    return gitService.checkAll(config.projects);
  });

  ipcMain.handle('toolchain:check', async () => toolchainService.checkAll());

  // Build (compile/simulate detected EE projects) — streams output to the renderer.
  const sendToRenderer = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };
  ipcMain.handle('build:detect', async (_event, folderPath) => buildService.detectBuild(folderPath));
  ipcMain.handle('build:run', async (_event, folderPath) =>
    buildService.runBuild(folderPath, (chunk) => sendToRenderer('app:build-output', chunk)));
  ipcMain.handle('build:flash', async (_event, payload = {}) =>
    buildService.flash(payload.folderPath, payload.port, (chunk) => sendToRenderer('app:build-output', chunk)));
  ipcMain.handle('build:cancel', async () => buildService.cancelBuild());

  // Serial Monitor — list ports and stream incoming data.
  ipcMain.handle('serial:listPorts', async () => serialService.listPorts());
  ipcMain.handle('serial:open', async (_event, payload = {}) =>
    serialService.openPort(payload, (chunk) => sendToRenderer('app:serial-data', chunk)));
  ipcMain.handle('serial:close', async () => serialService.closePort());

  ipcMain.handle('settings:get', async () => settingsService.getSettings());

  ipcMain.handle('settings:getSetupStatus', async () => {
    const res = settingsService.getSettings();
    const settings = res.settings || {};
    const general = settings.general || {};
    const checks = [
      { key: 'downloadsPath', label: 'Downloads', path: general.downloadsPath },
      { key: 'screenshotsPath', label: 'Screenshots', path: general.screenshotsPath },
      { key: 'vscodePath', label: 'VS Code', path: general.vscodePath },
    ].map((check) => ({
      ...check,
      ok: !!(check.path && fs.existsSync(check.path)),
    }));
    const projectRoots = (((settings.projectHub || {}).scanRoots) || []).map((root) => ({
      path: root,
      ok: !!(root && fs.existsSync(root)),
    }));
    const complete =
      general.firstRunCompleted === true &&
      checks.slice(0, 2).every((check) => check.ok) &&
      projectRoots.some((root) => root.ok);
    return { ok: true, complete, checks, projectRoots, settings };
  });

  ipcMain.handle('settings:save', async (_event, newSettings) =>
    settingsService.saveSettings(newSettings)
  );

  ipcMain.handle('settings:openFile', async () => {
    const res = settingsService.getSettings();
    try {
      await shell.openPath(res.path);
      return { ok: true, path: res.path };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // --- VS Code detection / file picker ---
  ipcMain.handle('vscode:detect', async () => {
    const config = loadConfig();
    return modeService.detectVSCode(config.general && config.general.vscodePath);
  });

  ipcMain.handle('vscode:test', async () => {
    const config = loadConfig();
    const det = await modeService.detectVSCode(config.general && config.general.vscodePath);
    if (!det.ok) return { ok: false, error: det.error };
    const launch = await modeService.launchExecutable(det.path);
    return launch.ok
      ? { ok: true, path: det.path }
      : { ok: false, path: det.path, error: launch.error || '啟動失敗' };
  });

  // Generic file/folder picker used by the Mode editor.
  ipcMain.handle('dialog:pickPath', async (_event, opts = {}) => {
    try {
      const isFolder = opts.type === 'folder';
      const result = await dialog.showOpenDialog(mainWindow, {
        title: opts.title || (isFolder ? '選擇資料夾' : '選擇檔案'),
        properties: [isFolder ? 'openDirectory' : 'openFile'],
        filters: isFolder
          ? undefined
          : opts.filters || [{ name: '所有檔案', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { ok: false, canceled: true };
      }
      return { ok: true, path: result.filePaths[0] };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Lightweight path existence check for live validation in the UI.
  ipcMain.handle('fs:pathInfo', async (_event, targetPath) => {
    try {
      if (!targetPath || !targetPath.trim()) return { exists: false, isFile: false, isDir: false };
      const stat = fs.statSync(targetPath);
      return { exists: true, isFile: stat.isFile(), isDir: stat.isDirectory() };
    } catch (_) {
      return { exists: false, isFile: false, isDir: false };
    }
  });

  ipcMain.handle('dialog:pickVSCode', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '選擇 VS Code 執行檔 (Code.exe)',
        properties: ['openFile'],
        filters: [
          { name: 'VS Code', extensions: ['exe', 'cmd'] },
          { name: '所有檔案', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { ok: false, canceled: true };
      }
      return { ok: true, path: result.filePaths[0] };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('shell:openExternal', async (_event, url) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('app:minimizeToTray', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return { ok: true };
  });

  // --- Start at login (toggle) ---
  ipcMain.handle('autolaunch:get', async () => {
    const config = loadConfig();
    const enabled = !(config.general && config.general.autoLaunch === false);
    const supported = autoLaunchService.isSupported();
    let openAtLogin = enabled;
    try {
      if (supported) openAtLogin = app.getLoginItemSettings().openAtLogin;
    } catch (_) {
      /* ignore */
    }
    return { ok: true, enabled, supported, openAtLogin };
  });

  ipcMain.handle('autolaunch:set', async (_event, value) => {
    const res = settingsService.getSettings();
    const next = { ...res.settings, general: { ...(res.settings.general || {}), autoLaunch: !!value } };
    const saved = settingsService.saveSettings(next);
    const applied = autoLaunchService.apply(!!value);
    return { ok: saved.ok, error: saved.error, supported: applied.supported, enabled: !!value };
  });

  // --- App updates ---
  ipcMain.handle('updates:getStatus', async () => updateService.getStatus());
  ipcMain.handle('updates:check', async () => updateService.check({ manual: true }));
  ipcMain.handle('updates:install', async () => updateService.install());

  // --- Project Hub ---
  ipcMain.handle('project:list', async () => {
    const config = loadConfig();
    return projectService.listProjects(config);
  });

  ipcMain.handle('project:scanStatus', async () => projectService.getScanStatus());

  ipcMain.handle('project:cancelScan', async () => projectService.cancelScan());

  ipcMain.handle('project:getHubSettings', async () => {
    const config = loadConfig();
    return { ok: true, projectHub: projectService.normalizeProjectHub(config) };
  });

  ipcMain.handle('project:saveHubSettings', async (_event, projectHub) => {
    const res = settingsService.getSettings();
    const next = {
      ...res.settings,
      projectHub: projectService.normalizeProjectHub({ projectHub }),
    };
    return settingsService.saveSettings(next);
  });

  ipcMain.handle('project:addScanRoot', async (_event, folderPath) => {
    if (!isUsableDir(folderPath)) {
      return { ok: false, error: `資料夾不存在或無效：${folderPath || '(空白)'}` };
    }
    const res = settingsService.getSettings();
    const hub = projectService.normalizeProjectHub(res.settings);
    const roots = Array.from(new Set([...(hub.scanRoots || []), folderPath].filter(Boolean)));
    return settingsService.saveSettings({
      ...res.settings,
      projectHub: { ...hub, scanRoots: roots },
    });
  });

  ipcMain.handle('project:removeScanRoot', async (_event, folderPath) => {
    const res = settingsService.getSettings();
    const hub = projectService.normalizeProjectHub(res.settings);
    const target = String(folderPath || '').toLowerCase();
    const roots = (hub.scanRoots || []).filter((root) => String(root).toLowerCase() !== target);
    return settingsService.saveSettings({
      ...res.settings,
      projectHub: { ...hub, scanRoots: roots },
    });
  });

  ipcMain.handle('project:excludeFolder', async (_event, folderPath) => {
    const res = settingsService.getSettings();
    const hub = projectService.normalizeProjectHub(res.settings);
    const excludes = Array.from(new Set([...(hub.excludeFolders || []), folderPath].filter(Boolean)));
    return settingsService.saveSettings({
      ...res.settings,
      projectHub: { ...hub, excludeFolders: excludes },
    });
  });

  ipcMain.handle('project:folderSize', async (_event, folderPath) => {
    const config = loadConfig();
    return projectService.calculateFolderSize(folderPath, config);
  });

  ipcMain.handle('project:createFromTemplate', async (_event, payload = {}) => {
    try {
      const res = settingsService.getSettings();
      const created = await projectService.createFromTemplate(res.settings, payload);
      if (!created.ok) return created;

      const projects = Array.isArray(res.settings.projects) ? [...res.settings.projects] : [];
      const target = String(created.project.path || '').toLowerCase();
      const exists = projects.some((project) => String(project.path || '').toLowerCase() === target);
      if (!exists) projects.push(created.project);

      const next = { ...res.settings, projects };
      if (payload.addToMode) {
        const modes = Array.isArray(next.modes) ? [...next.modes] : [];
        modes.push({
          name: `${created.project.name} 工作模式`,
          apps: [{
            name: 'VS Code',
            path: (res.settings.general && res.settings.general.vscodePath) || 'Code.exe',
            icon: 'VS',
            workspaceFolder: created.project.path,
          }],
          folders: [created.project.path],
          urls: [payload.githubUrl || 'https://github.com/'],
          commands: [],
        });
        next.modes = modes;
      }

      const saved = settingsService.saveSettings(next);
      return { ...created, saved };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('project:action', async (_event, payload) => {
    const config = loadConfig();
    return projectService.runAction(config, payload);
  });

  // --- Command Palette ---
  ipcMain.handle('command:list', async () => {
    const config = loadConfig();
    return { ok: true, commands: commandService.listCommands(config) };
  });

  ipcMain.handle('command:run', async (_event, commandId) => {
    const config = loadConfig();
    return commandService.runCommand(config, commandId);
  });

  // --- Smart Rules ---
  ipcMain.handle('rules:get', async () => {
    const config = loadConfig();
    return { ok: true, rules: ruleService.getRules(config), types: ruleService.RULE_TYPES };
  });

  ipcMain.handle('rules:save', async (_event, rules) => {
    const res = settingsService.getSettings();
    const next = { ...res.settings, rules: Array.isArray(rules) ? rules : [] };
    return settingsService.saveSettings(next);
  });

  // --- Clean Center ---
  ipcMain.handle('cleanup:getSettings', async () => cleanupService.loadCleanupSettings());
  ipcMain.handle('cleanup:saveSettings', async (_event, settings) => cleanupService.saveCleanupSettings(settings));
  ipcMain.handle('cleanup:getLogs', async () => {
    const logs = await cleanupService.readCleanupLogs();
    return { ok: true, path: cleanupService.cleanupLogsPath(), logs };
  });
  ipcMain.handle('cleanup:openLogFile', async () => {
    try {
      const target = cleanupService.cleanupLogsPath();
      const err = await shell.openPath(target);
      return err ? { ok: false, path: target, error: err } : { ok: true, path: target };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('cleanup:clearLogs', async () => cleanupService.clearLogs());
  ipcMain.handle('cleanup:exportLogs', async (_event, format = 'json') => cleanupService.exportLogs(format));
  ipcMain.handle('cleanup:status', async () => cleanupService.getStatus());
  ipcMain.handle('cleanup:getSummary', async () => cleanupService.getStatus());
  ipcMain.handle('cleanup:scan', async (_event, payload = {}) => cleanupService.scan(payload));
  ipcMain.handle('cleanup:cleanSelected', async (_event, payload = {}) => {
    const items = Array.isArray(payload) ? payload : payload.items;
    return cleanupService.cleanSelectedFiles(items || [], payload.settings || {});
  });
  ipcMain.handle('cleanup:getIgnoreList', async () => cleanupService.getIgnoreList());
  ipcMain.handle('cleanup:addIgnoreItem', async (_event, item) => cleanupService.addIgnoreItem(item));
  ipcMain.handle('cleanup:removeIgnoreItem', async (_event, id) => cleanupService.removeIgnoreItem(id));
  ipcMain.handle('cleanup:getDiskUsage', async (_event, drivePath) => cleanupService.getDiskUsage(drivePath));
  ipcMain.handle('cleanup:getRecommendations', async (_event, payload = {}) => cleanupService.getRecommendations(payload));
  ipcMain.handle('cleanup:automationAction', async (_event, type, options = {}) => cleanupService.runAutomationAction(type, options));
  ipcMain.handle('cleanup:recycleBin', async () => cleanupService.getRecycleBinInfo());
  ipcMain.handle('cleanup:emptyRecycleBin', async () => cleanupService.emptyRecycleBin());
  ipcMain.handle('cleanup:startupItems', async () => {
    const loaded = await cleanupService.loadCleanupSettings();
    return cleanupService.scanStartupItems(loaded.settings);
  });
  ipcMain.handle('cleanup:openPath', async (_event, targetPath) => {
    try {
      const p = targetPath && fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()
        ? path.dirname(targetPath)
        : targetPath;
      const err = await shell.openPath(p);
      return err ? { ok: false, error: err } : { ok: true, path: p };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // --- Screenshot Organizer ---
  ipcMain.handle('screenshots:getSettings', async () => {
    const config = loadConfig();
    return {
      ok: true,
      screenshotsPath: screenshotService.getScreenshotsPath(config),
      settings: screenshotService.getSettings(config),
    };
  });

  ipcMain.handle('screenshots:updateSettings', async (_event, patch = {}) => {
    const res = settingsService.getSettings();
    const current = screenshotService.getSettings(res.settings);
    const nextSettings = screenshotService.getSettings({
      screenshots: {
        organizer: {
          ...current,
          ...patch,
        },
      },
    });
    const next = {
      ...res.settings,
      screenshots: {
        ...(res.settings.screenshots || {}),
        organizer: nextSettings,
      },
    };
    const saved = settingsService.saveSettings(next);
    return {
      ok: saved.ok,
      error: saved.error,
      screenshotsPath: screenshotService.getScreenshotsPath(next),
      settings: nextSettings,
    };
  });

  ipcMain.handle('screenshots:scan', async (_event, payload = {}) => {
    const config = loadConfig();
    return screenshotService.scan(config, payload.settings || {});
  });

  ipcMain.handle('screenshots:organize', async (_event, payload = {}) => {
    const items = Array.isArray(payload) ? payload : payload.items;
    if (!Array.isArray(items)) return { ok: false, moved: 0, failed: 0, results: [], error: 'Invalid screenshot organize items.' };
    return screenshotService.organizeScreenshots(items, payload.settings || {});
  });

  // --- File monitoring ---
  ipcMain.handle('monitor:getState', async () => {
    const config = loadConfig();
    return {
      ok: true,
      enabled: config.general && config.general.watchEnabled !== false,
      paused: fileWatcherService.isPaused(),
      watched: fileWatcherService.watchedCount(),
      folders: monitorFolders(config),
    };
  });

  ipcMain.handle('monitor:setPaused', async (_event, value) => {
    fileWatcherService.setPaused(!!value);
    refreshTrayMenu();
    return { ok: true, paused: fileWatcherService.isPaused() };
  });

  ipcMain.handle('monitor:restart', async () => {
    startMonitoring();
    refreshTrayMenu();
    return { ok: true, watched: fileWatcherService.watchedCount() };
  });

  // --- Automations ---
  ipcMain.handle('automations:list', async () => {
    const config = loadConfig();
    return { ok: true, automations: automationService.list(config) };
  });

  ipcMain.handle('automations:save', async (_event, automations) => {
    if (!Array.isArray(automations)) return { ok: false, error: '無效的規則資料' };
    const res = settingsService.getSettings();
    const saved = settingsService.saveSettings({ ...res.settings, automations });
    if (saved.ok) {
      startMonitoring();
      startBackgroundServices();
      refreshTrayMenu();
    }
    return saved;
  });

  ipcMain.handle('automations:run', async (_event, ruleId) => {
    const config = loadConfig();
    const rule = automationService.list(config).find((item) => item && item.id === ruleId);
    if (!rule) return { ok: false, error: '找不到自動化規則' };
    const result = await automationService.runRule(rule, config);
    if (result.ok) {
      writeLog('info', `automation manual run: ${JSON.stringify(result)}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:automation-fired', [result]);
      }
    }
    return result;
  });

  // --- Notifications ---
  ipcMain.handle('notifications:test', async () => notificationService.notify('PC Life Assistant', '通知測試 ✅'));
  ipcMain.handle('notifications:list', async () => notificationService.listEvents());
  ipcMain.handle('notifications:markRead', async (_event, id) => notificationService.markRead(id));
  ipcMain.handle('notifications:clear', async () => notificationService.clearEvents());

  // --- Activity History / Restore Center ---
  ipcMain.handle('history:list', async () => activityHistoryService.listHistory());
  ipcMain.handle('history:restoreDownloadsLast', async () => activityHistoryService.restoreDownloadsLast());

  // --- Health Guard ---
  ipcMain.handle('healthGuard:get', async () => healthGuardService.status(loadConfig()));
  ipcMain.handle('healthGuard:checkNow', async () => healthGuardService.check(loadConfig()));
  ipcMain.handle('healthGuard:save', async (_event, patch = {}) => {
    const res = settingsService.getSettings();
    const next = {
      ...res.settings,
      healthGuard: {
        ...(res.settings.healthGuard || {}),
        ...patch,
      },
    };
    const saved = settingsService.saveSettings(next);
    if (saved.ok) startBackgroundServices();
    return { ok: saved.ok, error: saved.error, healthGuard: next.healthGuard };
  });

  // --- Advanced: export / import / reset / logs ---
  ipcMain.handle('settings:export', async () => {
    try {
      const res = settingsService.getSettings();
      const out = await dialog.showSaveDialog(mainWindow, {
        title: '匯出設定',
        defaultPath: 'pc-life-assistant-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (out.canceled || !out.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(out.filePath, JSON.stringify(res.settings, null, 2), 'utf-8');
      return { ok: true, path: out.filePath };
    } catch (err) {
      writeLog('error', `settings:export failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('settings:import', async () => {
    try {
      const inp = await dialog.showOpenDialog(mainWindow, {
        title: '匯入設定',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (inp.canceled || !inp.filePaths || !inp.filePaths.length) return { ok: false, canceled: true };
      const raw = fs.readFileSync(inp.filePaths[0], 'utf-8');
      const parsed = JSON.parse(raw); // throws on invalid JSON
      // Reject anything that is not a plain settings object (array/string/number/null)
      // so a malformed import can't overwrite the saved settings.
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: '匯入失敗：設定檔格式不正確（需為 JSON 物件）。' };
      }
      // Normalize against defaults so a partial import becomes a complete, valid config.
      const saved = settingsService.saveSettings(settingsService.mergeSettings(parsed));
      if (saved.ok) {
        configureAutoLaunch();
        startMonitoring();
        startBackgroundServices();
        refreshTrayMenu();
      }
      return saved;
    } catch (err) {
      writeLog('error', `settings:import failed: ${err.message}`);
      return { ok: false, error: `匯入失敗：${err.message}` };
    }
  });

  ipcMain.handle('settings:reset', async () => {
    const saved = settingsService.saveSettings(settingsService.createDefaultSettings());
    if (saved.ok) {
      configureAutoLaunch();
      startMonitoring();
      startBackgroundServices();
      refreshTrayMenu();
    }
    return saved;
  });

  ipcMain.handle('logs:open', async () => {
    try {
      const dir = logsDir();
      fs.mkdirSync(dir, { recursive: true });
      await shell.openPath(dir);
      return { ok: true, path: dir };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.on('second-instance', () => {
  showWindow('dashboard');
});

function openCommandPalette() {
  const win = createWindow();
  win.show();
  win.focus();
  const send = () => win.webContents.send('app:open-command-palette');
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

app.whenReady().then(() => {
  configureAutoLaunch();
  registerIpc();
  // Default to showing the main page on login/reboot. The old --hidden login arg
  // is ignored unless the user explicitly turns off startup pop-up behavior.
  const cfg = loadConfig();
  const showOnStartup = !(cfg.general && cfg.general.showOnStartup === false);
  const startHidden = !showOnStartup && (startedHidden || (cfg.general && cfg.general.startMinimized === true));
  createWindow(!startHidden);
  createTray();
  startMonitoring();
  startBackgroundServices();
  updateService.setup({
    getWindow: () => mainWindow,
    notify: (title, body) => notificationService.notify(title, body),
    log: writeLog,
    onEvent: () => refreshTrayMenu(),
  });
  if (cfg.general && cfg.general.autoUpdate !== false) {
    setTimeout(() => updateService.check(), 5000);
  }

  powerMonitor.on('resume', () => {
    showWindowAfterWake('resume');
  });

  powerMonitor.on('unlock-screen', () => {
    showWindowAfterWake('unlock-screen');
  });

  powerMonitor.on('user-did-resign-active', () => {
    lastUserInactiveAt = Date.now();
  });

  powerMonitor.on('user-did-become-active', () => {
    const inactiveMs = lastUserInactiveAt ? Date.now() - lastUserInactiveAt : 0;
    // Display sleep often does not fire a full OS resume event. Treat a return
    // from a meaningful idle period as a screen wake and surface the dashboard.
    if (!lastUserInactiveAt || inactiveMs >= 30000) {
      showWindowAfterWake(`user-did-become-active:${inactiveMs}`);
    }
  });

  // Global shortcut: Ctrl+Shift+P opens the Command Palette (works even unfocused).
  const registered = globalShortcut.register('CommandOrControl+Shift+P', openCommandPalette);
  if (!registered) {
    console.warn('[main] 無法註冊 Ctrl+Shift+P 全域快捷鍵（可能已被其他程式佔用）。');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep running in the tray even when all windows are closed (Windows-first behaviour).
app.on('window-all-closed', () => {
  // Intentionally do nothing: the app lives in the tray until the user chooses "離開".
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
