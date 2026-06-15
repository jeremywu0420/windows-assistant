'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { shell, app } = require('electron');

/**
 * Quick Mode launcher service.
 *
 * Runs a configured "mode": opens apps, opens folders, opens URLs, and runs
 * shell commands. Every step is independent — one failure never stops the rest,
 * and a bad/missing path produces a friendly error instead of crashing.
 */

// The app's own Vite dev server. Opening it in an external browser just shows
// the UI without the Electron preload bridge ("無法連接 Electron 主程序"), so in
// development we skip it instead of launching Edge/Chrome.
const DEV_SERVER_HOSTS = new Set(['localhost', '127.0.0.1']);
const DEV_SERVER_PORT = '5173';

function isOwnDevServerUrl(url) {
  try {
    const u = new URL(url);
    return DEV_SERVER_HOSTS.has(u.hostname) && u.port === DEV_SERVER_PORT;
  } catch (_) {
    return false;
  }
}

function listModes(config) {
  const modes = config && Array.isArray(config.modes) ? config.modes : [];
  return modes.map((m) => ({
    name: m.name,
    apps: m.apps || [],
    folders: m.folders || [],
    urls: m.urls || [],
    commands: m.commands || [],
  }));
}

function findMode(config, modeName) {
  const modes = listModes(config);
  if (!modeName) return modes[0] || null;
  return modes.find((m) => m.name === modeName) || null;
}

async function openApp(appPath, steps) {
  if (!fs.existsSync(appPath)) {
    steps.push({ type: 'app', target: appPath, status: 'error', message: '找不到應用程式路徑' });
    return;
  }
  try {
    // shell.openPath launches the file with its default handler (executes .exe on Windows).
    const err = await shell.openPath(appPath);
    if (err) {
      steps.push({ type: 'app', target: appPath, status: 'error', message: err });
    } else {
      steps.push({ type: 'app', target: appPath, status: 'ok', message: '已開啟' });
    }
  } catch (err) {
    steps.push({ type: 'app', target: appPath, status: 'error', message: err.message });
  }
}

async function openFolder(folderPath, steps) {
  if (!fs.existsSync(folderPath)) {
    steps.push({ type: 'folder', target: folderPath, status: 'error', message: '找不到資料夾' });
    return;
  }
  try {
    const err = await shell.openPath(folderPath);
    if (err) {
      steps.push({ type: 'folder', target: folderPath, status: 'error', message: err });
    } else {
      steps.push({ type: 'folder', target: folderPath, status: 'ok', message: '已開啟' });
    }
  } catch (err) {
    steps.push({ type: 'folder', target: folderPath, status: 'error', message: err.message });
  }
}

async function openUrl(url, steps) {
  // In development, never open the app's own dev server in an external browser.
  if (!app.isPackaged && isOwnDevServerUrl(url)) {
    steps.push({
      type: 'url',
      target: url,
      status: 'skipped',
      message: '已略過：這是 App 自己的開發網址 (localhost:5173)，請用 Electron 視窗操作，不需在瀏覽器開啟',
    });
    return;
  }
  try {
    await shell.openExternal(url);
    steps.push({ type: 'url', target: url, status: 'ok', message: '已在瀏覽器開啟' });
  } catch (err) {
    steps.push({ type: 'url', target: url, status: 'error', message: err.message });
  }
}

function runCommand(cmd, steps) {
  return new Promise((resolve) => {
    const cwd = cmd && cmd.cwd ? cmd.cwd : process.cwd();
    const commandText = cmd && cmd.command ? cmd.command : '';

    if (!commandText) {
      steps.push({ type: 'command', target: '(空白)', status: 'error', message: '指令為空' });
      return resolve();
    }
    if (cmd.cwd && !fs.existsSync(cmd.cwd)) {
      steps.push({ type: 'command', target: commandText, cwd, status: 'error', message: `找不到工作目錄：${cwd}` });
      return resolve();
    }

    try {
      // Detached so the dev server keeps running independently of this app.
      const isWin = process.platform === 'win32';
      const child = spawn(commandText, {
        cwd,
        shell: true,
        detached: !isWin,
        stdio: 'ignore',
        windowsHide: false,
      });

      child.on('error', (err) => {
        steps.push({ type: 'command', target: commandText, cwd, status: 'error', message: err.message });
        resolve();
      });

      // Give it a brief moment to fail fast (e.g. command not found). If it is
      // still alive after the delay we treat it as "started".
      const timer = setTimeout(() => {
        if (!isWin) {
          try {
            child.unref();
          } catch (_) {
            /* noop */
          }
        }
        steps.push({ type: 'command', target: commandText, cwd, status: 'ok', message: '已啟動' });
        resolve();
      }, 600);

      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          steps.push({ type: 'command', target: commandText, cwd, status: 'ok', message: '已執行完成' });
        } else {
          steps.push({ type: 'command', target: commandText, cwd, status: 'error', message: `結束代碼 ${code}` });
        }
        resolve();
      });
    } catch (err) {
      steps.push({ type: 'command', target: commandText, cwd, status: 'error', message: err.message });
      resolve();
    }
  });
}

async function runMode(config, modeName) {
  const mode = findMode(config, modeName);
  if (!mode) {
    return { ok: false, mode: modeName || '(預設)', error: '找不到指定的模式設定', steps: [] };
  }

  const steps = [];

  for (const app of mode.apps || []) {
    // eslint-disable-next-line no-await-in-loop
    await openApp(app, steps);
  }
  for (const folder of mode.folders || []) {
    // eslint-disable-next-line no-await-in-loop
    await openFolder(folder, steps);
  }
  for (const url of mode.urls || []) {
    // eslint-disable-next-line no-await-in-loop
    await openUrl(url, steps);
  }
  for (const cmd of mode.commands || []) {
    // eslint-disable-next-line no-await-in-loop
    await runCommand(cmd, steps);
  }

  const hasError = steps.some((s) => s.status === 'error');
  return { ok: !hasError, mode: mode.name, steps };
}

module.exports = {
  listModes,
  findMode,
  runMode,
};
