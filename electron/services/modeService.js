'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFile } = require('child_process');

let electronShell = null;
let electronApp = null;
try {
  const electron = require('electron');
  electronShell = electron && electron.shell ? electron.shell : null;
  electronApp = electron && electron.app ? electron.app : null;
} catch (_) {
  // Keep this service importable in Node-based smoke tests.
}

const DEV_SERVER_HOSTS = new Set(['localhost', '127.0.0.1']);
const DEV_SERVER_PORT = '5173';
const DEFAULT_DEV_PORT = 5173;
const VSCODE_REL = path.join('AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe');
const VSCODE_NOT_FOUND = '找不到 VS Code，請到設定選擇 Code.exe 路徑。';

function isPackaged() {
  return !!(electronApp && electronApp.isPackaged);
}

function requireShell() {
  if (!electronShell) throw new Error('Electron shell is unavailable.');
  return electronShell;
}

function isOwnDevServerUrl(url) {
  try {
    const parsed = new URL(url);
    return DEV_SERVER_HOSTS.has(parsed.hostname) && parsed.port === DEV_SERVER_PORT;
  } catch (_) {
    return false;
  }
}

function baseName(value) {
  const text = String(value || '');
  const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return index >= 0 ? text.slice(index + 1) : text;
}

function isVSCodePath(value) {
  if (!value) return false;
  const base = baseName(value).toLowerCase();
  return (
    base === 'code.exe' ||
    base === 'code.cmd' ||
    base === 'code' ||
    /microsoft vs code/i.test(value)
  );
}

function deriveAppName(value) {
  if (isVSCodePath(value)) return 'VS Code';
  if (!value) return '(未命名)';
  const base = baseName(value);
  return base.replace(/\.[^.]+$/, '') || base;
}

function normalizeApp(entry) {
  if (typeof entry === 'string')
    return { path: entry, name: deriveAppName(entry), icon: '', workspaceFolder: '' };
  if (entry && typeof entry === 'object') {
    const appPath = entry.path || '';
    return {
      path: appPath,
      name: entry.name || deriveAppName(appPath),
      icon: entry.icon || '',
      workspaceFolder: entry.workspaceFolder || '',
    };
  }
  return { path: '', name: '(empty)', icon: '', workspaceFolder: '' };
}

function appLabel(appObj) {
  return `${appObj.icon ? `${appObj.icon} ` : ''}${appObj.name || deriveAppName(appObj.path)}`.trim();
}

function whichCode() {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    execFile(finder, ['code'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const existing = lines.find((line) => {
        try {
          return fs.existsSync(line);
        } catch (_) {
          return false;
        }
      });
      resolve(existing || lines[0] || null);
    });
  });
}

async function detectVSCode(preferred) {
  const candidates = [];
  if (preferred && preferred.trim()) candidates.push(preferred.trim());
  candidates.push(path.join(os.homedir(), VSCODE_REL));
  if (process.env.LOCALAPPDATA)
    candidates.push(
      path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    );
  if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, VSCODE_REL));
  candidates.push('C:\\Program Files\\Microsoft VS Code\\Code.exe');
  candidates.push('C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe');

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      if (fs.existsSync(candidate)) return { ok: true, path: candidate };
    } catch (_) {
      // keep trying
    }
  }

  const fromPath = await whichCode();
  if (fromPath) return { ok: true, path: fromPath };
  return { ok: false, error: VSCODE_NOT_FOUND };
}

function listModes(config) {
  const modes = config && Array.isArray(config.modes) ? config.modes : [];
  return modes.map((mode) => ({
    name: mode.name,
    apps: mode.apps || [],
    folders: mode.folders || [],
    urls: mode.urls || [],
    commands: mode.commands || [],
  }));
}

function findMode(config, modeName) {
  const modes = listModes(config);
  if (!modeName) return modes[0] || null;
  return modes.find((mode) => mode.name === modeName) || null;
}

function launchExecutable(execPath) {
  return new Promise((resolve) => {
    try {
      if (/\.exe$/i.test(execPath)) {
        requireShell()
          .openPath(execPath)
          .then((err) => resolve(err ? { ok: false, error: err } : { ok: true }))
          .catch((err) => resolve({ ok: false, error: err.message }));
        return;
      }

      const child = spawn(`"${execPath}"`, [], {
        shell: true,
        detached: process.platform !== 'win32',
        stdio: 'ignore',
        windowsHide: false,
      });
      child.on('error', (err) => resolve({ ok: false, error: err.message }));
      setTimeout(() => {
        try {
          child.unref();
        } catch (_) {
          // noop
        }
        resolve({ ok: true });
      }, 400);
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

async function openVSCode(appObj, configuredVscode, steps) {
  const label = appObj.name ? appLabel(appObj) : 'VS Code';
  const detected = await detectVSCode(configuredVscode || appObj.path);
  if (!detected.ok) {
    steps.push({ type: 'app', target: label, status: 'error', message: detected.error });
    return;
  }

  let launch;
  if (appObj.workspaceFolder && fs.existsSync(appObj.workspaceFolder)) {
    launch = await new Promise((resolve) => {
      try {
        const child = spawn(detected.path, [appObj.workspaceFolder], {
          detached: process.platform !== 'win32',
          stdio: 'ignore',
          windowsHide: false,
        });
        child.on('error', (err) => resolve({ ok: false, error: err.message }));
        setTimeout(() => {
          try {
            child.unref();
          } catch (_) {
            // noop
          }
          resolve({ ok: true });
        }, 400);
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    });
  } else {
    launch = await launchExecutable(detected.path);
  }

  steps.push({
    type: 'app',
    target: appObj.workspaceFolder ? label + ' (' + appObj.workspaceFolder + ')' : label,
    status: launch.ok ? 'ok' : 'error',
    message: launch.ok ? 'Opened ' + detected.path : launch.error || 'Launch failed',
  });
}

async function openApp(appObj, steps) {
  const label = appLabel(appObj);
  if (!appObj.path || !fs.existsSync(appObj.path)) {
    steps.push({
      type: 'app',
      target: label,
      status: 'error',
      message: `找不到應用程式：${appObj.path || '(空白)'}`,
    });
    return;
  }

  const launch = await launchExecutable(appObj.path);
  steps.push({
    type: 'app',
    target: label,
    status: launch.ok ? 'ok' : 'error',
    message: launch.ok ? `已啟動 ${appObj.path}` : launch.error || '啟動失敗',
  });
}

async function openFolder(folderPath, steps) {
  if (!fs.existsSync(folderPath)) {
    steps.push({ type: 'folder', target: folderPath, status: 'error', message: '找不到資料夾' });
    return;
  }

  try {
    const err = await requireShell().openPath(folderPath);
    steps.push({
      type: 'folder',
      target: folderPath,
      status: err ? 'error' : 'ok',
      message: err || '已開啟',
    });
  } catch (err) {
    steps.push({ type: 'folder', target: folderPath, status: 'error', message: err.message });
  }
}

async function openUrl(url, steps) {
  if (!isPackaged() && isOwnDevServerUrl(url)) {
    steps.push({
      type: 'url',
      target: url,
      status: 'skipped',
      message: '略過 App 自己的開發伺服器，避免用外部瀏覽器開啟缺少 Electron bridge 的頁面。',
    });
    return;
  }

  try {
    await requireShell().openExternal(url);
    steps.push({ type: 'url', target: url, status: 'ok', message: '已開啟網址' });
  } catch (err) {
    steps.push({ type: 'url', target: url, status: 'error', message: err.message });
  }
}

function isDevServerCommand(text) {
  return /(^|\s)(npm|pnpm|yarn)\s+(run\s+)?dev(\s|$)/i.test(text || '');
}

function portFromCommand(commandText) {
  const match = (commandText || '').match(/(?:--port|-p)[ =](\d{2,5})/i);
  return match ? parseInt(match[1], 10) : null;
}

function portFromViteConfig(cwd) {
  if (!cwd) return null;
  for (const name of ['vite.config.js', 'vite.config.mjs', 'vite.config.ts', 'vite.config.cjs']) {
    try {
      const filePath = path.join(cwd, name);
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, 'utf-8');
        const match = text.match(/port\s*:\s*(\d{2,5})/);
        if (match) return parseInt(match[1], 10);
      }
    } catch (_) {
      // ignore unreadable config
    }
  }
  return null;
}

function devServerPort(commandText, cwd) {
  return portFromCommand(commandText) || portFromViteConfig(cwd) || DEFAULT_DEV_PORT;
}

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
    steps.push({ type: 'command', target: '(空白)', status: 'error', message: '指令不可空白' });
    return;
  }
  if (cmd.cwd && !fs.existsSync(cmd.cwd)) {
    steps.push({
      type: 'command',
      target: commandText,
      cwd,
      status: 'error',
      message: `找不到工作目錄：${cwd}`,
    });
    return;
  }

  if (isDevServerCommand(commandText)) {
    const port = devServerPort(commandText, cwd);
    const probe = await probeLocalServer(port);
    if (probe.reachable) {
      let decision = 'skip';
      if (typeof options.onDevServerRunning === 'function') {
        try {
          decision = await options.onDevServerRunning({
            port,
            isOwn: probe.isOwn,
            command: commandText,
          });
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
            : `localhost:${port} 已被其他程式使用，略過 ${commandText}。`,
        });
        return;
      }
    }
  }

  await new Promise((resolve) => {
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
        steps.push({
          type: 'command',
          target: commandText,
          cwd,
          status: 'error',
          message: err.message,
        });
        resolve();
      });

      const timer = setTimeout(() => {
        if (!isWin) {
          try {
            child.unref();
          } catch (_) {
            // noop
          }
        }
        steps.push({ type: 'command', target: commandText, cwd, status: 'ok', message: '已啟動' });
        resolve();
      }, 600);

      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          steps.push({
            type: 'command',
            target: commandText,
            cwd,
            status: 'ok',
            message: '已完成',
          });
        } else {
          steps.push({
            type: 'command',
            target: commandText,
            cwd,
            status: 'error',
            message: `結束碼 ${code}`,
          });
        }
        resolve();
      });
    } catch (err) {
      steps.push({
        type: 'command',
        target: commandText,
        cwd,
        status: 'error',
        message: err.message,
      });
      resolve();
    }
  });
}

async function runMode(config, modeName, options = {}) {
  const mode = findMode(config, modeName);
  if (!mode) {
    return { ok: false, mode: modeName || '(預設)', error: '找不到工作模式設定', steps: [] };
  }

  const general = (config && config.general) || {};
  const steps = [];

  for (const rawApp of mode.apps || []) {
    const appObj = normalizeApp(rawApp);
    if (isVSCodePath(appObj.path)) await openVSCode(appObj, general.vscodePath, steps);
    else await openApp(appObj, steps);
  }
  for (const folder of mode.folders || []) await openFolder(folder, steps);
  for (const url of mode.urls || []) await openUrl(url, steps);
  for (const command of mode.commands || []) await runCommand(command, steps, options);

  const hasError = steps.some((step) => step.status === 'error');
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
