'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFile } = require('child_process');
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
const DEV_SERVER_PORT_NUM = 5173;

function isOwnDevServerUrl(url) {
  try {
    const u = new URL(url);
    return DEV_SERVER_HOSTS.has(u.hostname) && u.port === DEV_SERVER_PORT;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// VS Code detection
// ---------------------------------------------------------------------------
const VSCODE_NOT_FOUND = '找不到 VS Code，請到設定頁面指定 Code.exe 路徑。';

function isVSCodePath(p) {
  if (!p) return false;
  const base = path.basename(p).toLowerCase();
  return (
    base === 'code.exe' ||
    base === 'code.cmd' ||
    base === 'code' ||
    /microsoft vs code/i.test(p)
  );
}

function whichCode() {
  // Resolves VS Code's CLI launcher (code.cmd / code) from PATH.
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    execFile(finder, ['code'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      // Prefer an entry that actually exists on disk.
      const existing = lines.find((l) => {
        try {
          return fs.existsSync(l);
        } catch (_) {
          return false;
        }
      });
      resolve(existing || lines[0] || null);
    });
  });
}

/**
 * Detect a usable VS Code executable.
 * Order: preferred (config) → Jeremy's user path → %LOCALAPPDATA% → Program Files
 *        → Program Files (x86) → `where code` → friendly error.
 */
async function detectVSCode(preferred) {
  const candidates = [];
  if (preferred && preferred.trim()) candidates.push(preferred.trim());
  candidates.push('C:\\Users\\Jeremy\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe');
  if (process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe')
    );
  }
  candidates.push('C:\\Program Files\\Microsoft VS Code\\Code.exe');
  candidates.push('C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe');

  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return { ok: true, path: c };
    } catch (_) {
      /* ignore and keep trying */
    }
  }

  const fromPath = await whichCode();
  if (fromPath) return { ok: true, path: fromPath };

  return { ok: false, error: VSCODE_NOT_FOUND };
}

// ---------------------------------------------------------------------------
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

/** Launch an executable; handles both .exe (shell.openPath) and .cmd/CLI (spawn). */
function launchExecutable(execPath) {
  return new Promise((resolve) => {
    try {
      if (/\.exe$/i.test(execPath)) {
        shell
          .openPath(execPath)
          .then((err) => resolve(err ? { ok: false, error: err } : { ok: true }))
          .catch((e) => resolve({ ok: false, error: e.message }));
        return;
      }
      // code.cmd or a bare CLI launcher — run it through the shell.
      const child = spawn(`"${execPath}"`, [], {
        shell: true,
        detached: process.platform !== 'win32',
        stdio: 'ignore',
        windowsHide: false,
      });
      child.on('error', (e) => resolve({ ok: false, error: e.message }));
      setTimeout(() => {
        try {
          child.unref();
        } catch (_) {
          /* noop */
        }
        resolve({ ok: true });
      }, 400);
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function openVSCode(appPath, configuredVscode, steps) {
  const det = await detectVSCode(configuredVscode || appPath);
  if (!det.ok) {
    steps.push({ type: 'app', target: 'VS Code', status: 'error', message: det.error });
    return;
  }
  const launch = await launchExecutable(det.path);
  if (launch.ok) {
    steps.push({ type: 'app', target: 'VS Code', status: 'ok', message: `已開啟 ${det.path}` });
  } else {
    steps.push({
      type: 'app',
      target: 'VS Code',
      status: 'error',
      message: launch.error || '啟動失敗',
    });
  }
}

async function openApp(appPath, steps) {
  if (!fs.existsSync(appPath)) {
    steps.push({ type: 'app', target: appPath, status: 'error', message: '找不到應用程式路徑' });
    return;
  }
  const launch = await launchExecutable(appPath);
  if (launch.ok) {
    steps.push({ type: 'app', target: appPath, status: 'ok', message: '已開啟' });
  } else {
    steps.push({ type: 'app', target: appPath, status: 'error', message: launch.error || '啟動失敗' });
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

// ---------------------------------------------------------------------------
// Dev-server duplicate-launch guard
// ---------------------------------------------------------------------------
function isDevServerCommand(text) {
  return /(^|\s)(npm|pnpm|yarn)\s+(run\s+)?dev(\s|$)/i.test(text || '');
}

/** Probe http://127.0.0.1:<port>/; returns whether it is reachable and whether it is OUR app. */
function probeLocalServer(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/', timeout: 1500 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          if (body.length < 4000) body += chunk.toString();
        });
        res.on('end', () => {
          resolve({ reachable: true, isOwn: /PC Life Assistant/i.test(body) });
        });
      }
    );
    req.on('error', () => resolve({ reachable: false, isOwn: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false, isOwn: false });
    });
  });
}

async function runCommand(cmd, steps) {
  const cwd = cmd && cmd.cwd ? cmd.cwd : process.cwd();
  const commandText = cmd && cmd.command ? cmd.command : '';

  if (!commandText) {
    steps.push({ type: 'command', target: '(空白)', status: 'error', message: '指令為空' });
    return;
  }
  if (cmd.cwd && !fs.existsSync(cmd.cwd)) {
    steps.push({ type: 'command', target: commandText, cwd, status: 'error', message: `找不到工作目錄：${cwd}` });
    return;
  }

  // Avoid double-starting the dev server (port conflict / multiple instances).
  if (isDevServerCommand(commandText)) {
    const probe = await probeLocalServer(DEV_SERVER_PORT_NUM);
    if (probe.reachable && probe.isOwn) {
      steps.push({
        type: 'command',
        target: commandText,
        cwd,
        status: 'skipped',
        message: 'localhost:5173 已在執行，略過 npm run dev。',
      });
      return;
    }
    if (probe.reachable && !probe.isOwn) {
      steps.push({
        type: 'command',
        target: commandText,
        cwd,
        status: 'skipped',
        message: 'localhost:5173 已被其他程式佔用（不是本專案），略過 npm run dev，請確認。',
      });
      return;
    }
  }

  return new Promise((resolve) => {
    try {
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

  const general = (config && config.general) || {};
  const steps = [];

  for (const appPath of mode.apps || []) {
    // eslint-disable-next-line no-await-in-loop
    if (isVSCodePath(appPath)) {
      // eslint-disable-next-line no-await-in-loop
      await openVSCode(appPath, general.vscodePath, steps);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await openApp(appPath, steps);
    }
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
  detectVSCode,
};
