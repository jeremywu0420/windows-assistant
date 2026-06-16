'use strict';

const fs = require('fs');
const os = require('os');
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
const DEFAULT_DEV_PORT = 5173;

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
const VSCODE_REL = path.join('AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe');

// Cross-separator basename so Windows-style paths are handled even on macOS/Linux.
function baseName(p) {
  const s = String(p || '');
  const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return idx >= 0 ? s.slice(idx + 1) : s;
}

function isVSCodePath(p) {
  if (!p) return false;
  const base = baseName(p).toLowerCase();
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
 * Detect a usable VS Code executable. Paths are built dynamically from the
 * current user's home directory / environment (no hardcoded username).
 * Order: preferred (config) → <home>\AppData\Local\... → %LOCALAPPDATA% →
 *        %USERPROFILE%\AppData\Local\... → Program Files (x64/x86) → `where code`.
 */
async function detectVSCode(preferred) {
  const candidates = [];
  if (preferred && preferred.trim()) candidates.push(preferred.trim());
  candidates.push(path.join(os.homedir(), VSCODE_REL));
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'));
  }
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, VSCODE_REL));
  }
  candidates.push('C:\\Program Files\\Microsoft VS Code\\Code.exe');
  candidates.push('C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe');

  const seen = new Set();
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    try {
      if (fs.existsSync(c)) return { ok: true, path: c };
    } catch (_) {
      /* keep trying */
    }
  }

  const fromPath = await whichCode();
  if (fromPath) return { ok: true, path: fromPath };

  return { ok: false, error: VSCODE_NOT_FOUND };
}

// ---------------------------------------------------------------------------
// App entry normalization (supports string OR { path, name, icon })
// ---------------------------------------------------------------------------
function deriveAppName(p) {
  if (isVSCodePath(p)) return 'VS Code';
  if (!p) return '(未命名)';
  const base = baseName(p);
  return base.replace(/\.[^.]+$/, '') || base; // strip a trailing extension
}

function normalizeApp(entry) {
  if (typeof entry === 'string') {
    return { path: entry, name: deriveAppName(entry), icon: '' };
  }
  if (entry && typeof entry === 'object') {
    const p = entry.path || '';
    return { path: p, name: entry.name || deriveAppName(p), icon: entry.icon || '' };
  }
  return { path: '', name: '(未命名)', icon: '' };
}

function appLabel(appObj) {
  return `${appObj.icon ? appObj.icon + ' ' : ''}${appObj.name}`.trim();
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

async function openVSCode(appObj, configuredVscode, steps) {
  const label = appObj.name ? appLabel(appObj) : 'VS Code';
  const det = await detectVSCode(configuredVscode || appObj.path);
  if (!det.ok) {
    steps.push({ type: 'app', target: label, status: 'error', message: det.error });
    return;
  }
  const launch = await launchExecutable(det.path);
  if (launch.ok) {
    steps.push({ type: 'app', target: label, status: 'ok', message: `已開啟 ${det.path}` });
  } else {
    steps.push({ type: 'app', target: label, status: 'error', message: launch.error || '啟動失敗' });
  }
}

async function openApp(appObj, steps) {
  const label = appLabel(appObj);
  if (!appObj.path || !fs.existsSync(appObj.path)) {
    steps.push({ type: 'app', target: label, status: 'error', message: `找不到應用程式路徑：${appObj.path || '(空白)'}` });
    return;
  }
  const launch = await launchExecutable(appObj.path);
  if (launch.ok) {
    steps.push({ type: 'app', target: label, status: 'ok', message: `已開啟 ${appObj.path}` });
  } else {
    steps.push({ type: 'app', target: label, status: 'error', message: launch.error || '啟動失敗' });
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

/** Infer the dev-server port from the command (e.g. "--port 3000"), else default 5173. */
function devServerPort(commandText) {
  const m = (commandText || '').match(/(?:--port|-p)[ =](\d{2,5})/i);
  return m ? parseInt(m[1], 10) : DEFAULT_DEV_PORT;
}

/** Probe http://127.0.0.1:<port>/; returns whether it is reachable and whether it is OUR app. */
function probeLocalServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        if (body.length < 4000) body += chunk.toString();
      });
      res.on('end', () => resolve({ reachable: true, isOwn: /PC Life Assistant/i.test(body) }));
    });
    req.on('error', () => resolve({ reachable: false, isOwn: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false, isOwn: false });
    });
  });
}

async function runCommand(cmd, steps, options = {}) {
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
    const port = devServerPort(commandText);
    const probe = await probeLocalServer(port);
    if (probe.reachable) {
      let decision = 'skip';
      if (typeof options.onDevServerRunning === 'function') {
        try {
          decision = await options.onDevServerRunning({ port, isOwn: probe.isOwn, command: commandText });
        } catch (_) {
          decision = 'skip';
        }
      }
      if (decision !== 'launch') {
        steps.push({
          type: 'command',
          target: commandText,
          cwd,
          status: 'skipped',
          message: probe.isOwn
            ? `localhost:${port} 已在執行，略過 ${commandText}。`
            : `localhost:${port} 已被其他程式佔用（不是本專案），略過 ${commandText}，請確認。`,
        });
        return;
      }
      // decision === 'launch' → fall through and start it anyway.
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

async function runMode(config, modeName, options = {}) {
  const mode = findMode(config, modeName);
  if (!mode) {
    return { ok: false, mode: modeName || '(預設)', error: '找不到指定的模式設定', steps: [] };
  }

  const general = (config && config.general) || {};
  const steps = [];

  for (const rawApp of mode.apps || []) {
    const appObj = normalizeApp(rawApp);
    // eslint-disable-next-line no-await-in-loop
    if (isVSCodePath(appObj.path)) {
      // eslint-disable-next-line no-await-in-loop
      await openVSCode(appObj, general.vscodePath, steps);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await openApp(appObj, steps);
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
    await runCommand(cmd, steps, options);
  }

  const hasError = steps.some((s) => s.status === 'error');
  return { ok: !hasError, mode: mode.name, steps };
}

module.exports = {
  listModes,
  findMode,
  runMode,
  detectVSCode,
  launchExecutable,
  normalizeApp,
};
