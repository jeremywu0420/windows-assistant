'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, globalShortcut, dialog } = require('electron');

const settingsService = require('./services/settingsService');
const systemMonitorService = require('./services/systemMonitorService');
const fileOrganizerService = require('./services/fileOrganizerService');
const gitService = require('./services/gitService');
const modeService = require('./services/modeService');
const projectService = require('./services/projectService');
const commandService = require('./services/commandService');
const ruleService = require('./services/ruleService');
const screenshotService = require('./services/screenshotService');

const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;
app.isQuitting = false;

// Ensure only a single instance runs (so the tray icon isn't duplicated).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
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

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
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
    mainWindow.show();
  });

  // Close button minimises to the system tray instead of quitting.
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
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

function createTray() {
  const iconPath = getTrayIconPath();
  let image = nativeImage.createFromPath(iconPath);
  if (process.platform === 'win32' && !image.isEmpty()) {
    image = image.resize({ width: 16, height: 16 });
  }
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('PC Life Assistant');

  const contextMenu = Menu.buildFromTemplate([
    { label: '開啟 PC Life Assistant', click: () => showWindow('dashboard') },
    { type: 'separator' },
    { label: '寫程式模式', click: () => runProgrammingModeFromTray() },
    { label: '整理 Downloads', click: () => showWindow('files') },
    { label: '檢查 Git', click: () => showWindow('health') },
    { type: 'separator' },
    {
      label: '離開',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
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
    return fileOrganizerService.organize(items);
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
  registerIpc();
  createWindow();
  createTray();

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
