'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, globalShortcut, dialog } = require('electron');

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

// True when the app was launched by Windows at login (we pass --hidden then).
const startedHidden = process.argv.includes('--hidden');

let mainWindow = null;
let tray = null;
app.isQuitting = false;

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
      mainWindow.show();
      mainWindow.focus();
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

function showWindow(navigateTo) {
  const win = createWindow();
  win.show();
  win.focus();
  if (navigateTo) {
    const send = () => win.webContents.send('app:navigate', navigateTo);
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }
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

  ipcMain.handle('files:scan', async () => {
    const config = loadConfig();
    const downloadsPath = await fileOrganizerService.resolveDownloadsPath(
      config.general && config.general.downloadsPath
    );
    return fileOrganizerService.scan(downloadsPath);
  });

  ipcMain.handle('downloads:detect', async () => fileOrganizerService.detectDownloads());

  ipcMain.handle('files:organize', async (_event, items) => {
    if (!Array.isArray(items)) return { ok: false, moved: 0, failed: 0, results: [], error: '無效的項目' };
    const result = fileOrganizerService.organize(items);
    lastOrganizeBatch = result.results || [];
    recordHistory(result);
    return result;
  });

  // Undo the last organize batch (move files back to their original location).
  ipcMain.handle('downloads:undo', async () => {
    if (!lastOrganizeBatch || lastOrganizeBatch.length === 0) {
      return { ok: false, error: '沒有可復原的整理紀錄' };
    }
    const result = downloadService.undo(lastOrganizeBatch);
    if (result.ok) lastOrganizeBatch = null; // consumed
    return result;
  });

  ipcMain.handle('downloads:openFolder', async () => {
    try {
      const config = loadConfig();
      const p = await fileOrganizerService.resolveDownloadsPath(config.general && config.general.downloadsPath);
      const err = await shell.openPath(p);
      return err ? { ok: false, error: err } : { ok: true, path: p };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('git:check', async () => {
    const config = loadConfig();
    return gitService.checkAll(config.projects);
  });

  ipcMain.handle('settings:get', async () => settingsService.getSettings());

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
    const supported = autoLaunchSupported();
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
    const applied = applyAutoLaunch(!!value);
    return { ok: saved.ok, error: saved.error, supported: applied.supported, enabled: !!value };
  });

  // --- Project Hub ---
  ipcMain.handle('project:list', async () => {
    const config = loadConfig();
    return projectService.listProjects(config);
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

  // --- Screenshot Organizer (reuses fileOrganizerService.organize for moving) ---
  ipcMain.handle('screenshots:scan', async () => {
    const config = loadConfig();
    return screenshotService.scan(config);
  });

  ipcMain.handle('screenshots:organize', async (_event, items) => {
    return fileOrganizerService.organize(items);
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
    return settingsService.saveSettings({ ...res.settings, automations });
  });

  // --- Notifications ---
  ipcMain.handle('notifications:test', async () => notificationService.notify('PC Life Assistant', '通知測試 ✅'));

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
      const saved = settingsService.saveSettings(parsed);
      if (saved.ok) {
        configureAutoLaunch();
        startMonitoring();
        refreshTrayMenu();
      }
      return saved;
    } catch (err) {
      writeLog('error', `settings:import failed: ${err.message}`);
      return { ok: false, error: `匯入失敗：${err.message}` };
    }
  });

  ipcMain.handle('settings:reset', async () => {
    const saved = settingsService.saveSettings(settingsService.DEFAULT_SETTINGS);
    if (saved.ok) {
      configureAutoLaunch();
      startMonitoring();
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
  // Stay hidden (tray only) when launched at login (--hidden) or when the
  // "start minimized" preference is on; otherwise show the window normally.
  const cfg = loadConfig();
  const startHidden = startedHidden || (cfg.general && cfg.general.startMinimized === true);
  createWindow(!startHidden);
  createTray();
  startMonitoring();

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
