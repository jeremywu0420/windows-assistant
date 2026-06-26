'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const CACHE_MS = 1500;
const SAMPLE_SECONDS = 1;
const IGNORE_APPS = new Set([
  'pc life assistant.exe',
  'electron.exe',
  'explorer.exe',
  'dwm.exe',
  'searchhost.exe',
  'shellexperiencehost.exe',
  'startmenuexperiencehost.exe',
  'textinputhost.exe',
  'applicationframehost.exe',
  'powershell.exe',
  'pwsh.exe',
  'cmd.exe',
  'conhost.exe',
  'windowsterminal.exe',
  'openconsole.exe',
]);

let cached = { at: 0, value: null };
let inFlight = null;

function execPowerShellJson(script, timeout = 3000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        timeout,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          resolve(JSON.parse(stdout));
        } catch (_) {
          resolve(null);
        }
      },
    );
  });
}

function execFileCapture(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        timeout: options.timeout || 4500,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err && typeof err.code !== 'undefined' ? err.code : 0,
          error: err ? err.message : '',
          stdout: stdout || '',
          stderr: stderr || '',
        });
      },
    );
  });
}

function existingFile(filePath) {
  try {
    return filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : null;
  } catch (_) {
    return null;
  }
}

function findPresentMonCandidates() {
  const candidates = [];
  if (process.env.PRESENTMON_PATH) candidates.push(process.env.PRESENTMON_PATH);
  candidates.push(
    path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft',
      'WinGet',
      'Packages',
      'Intel.PresentMon.Console_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'presentmon.exe',
    ),
  );
  candidates.push(
    path.join(
      process.env.ProgramFiles || 'C:\\Program Files',
      'Intel',
      'PresentMon',
      'presentmon.exe',
    ),
  );
  candidates.push(
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PresentMon', 'presentmon.exe'),
  );
  candidates.push(
    path.join(
      process.env.ProgramFiles || 'C:\\Program Files',
      'NVIDIA Corporation',
      'FrameViewSDK',
      'bin',
      'PresentMon_x64.exe',
    ),
  );
  candidates.push(
    path.join(
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      'NVIDIA Corporation',
      'FrameViewSDK',
      'bin',
      'PresentMon_x64.exe',
    ),
  );
  return Array.from(new Set(candidates)).map(existingFile).filter(Boolean);
}

async function findPresentMon() {
  const candidate = findPresentMonCandidates()[0];
  if (candidate) return candidate;

  const where = await execFileCapture('where.exe', ['presentmon'], { timeout: 2000 });
  if (!where.ok || !where.stdout) return null;
  return (
    where.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => existingFile(line)) || null
  );
}

async function getForegroundProcess() {
  const script = String.raw`
$code = @"
using System;
using System.Runtime.InteropServices;
public static class ForegroundWindowReader {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
try { Add-Type -TypeDefinition $code -ErrorAction Stop | Out-Null } catch {}
$hwnd = [ForegroundWindowReader]::GetForegroundWindow()
[uint32]$pid = 0
[ForegroundWindowReader]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
$p = Get-Process -Id $pid -ErrorAction SilentlyContinue
if ($p) {
  [pscustomobject]@{
    pid = [int]$pid
    processName = $p.ProcessName
    exeName = "$($p.ProcessName).exe"
    title = $p.MainWindowTitle
    path = $p.Path
  } | ConvertTo-Json -Compress
}
`;
  return execPowerShellJson(script, 2500);
}

function presentMonArgs(exePath, outputFile, foreground) {
  const modern = path.basename(exePath).toLowerCase() === 'presentmon.exe';
  const shouldTarget =
    foreground &&
    foreground.pid &&
    !IGNORE_APPS.has(String(foreground.exeName || '').toLowerCase());

  if (modern) {
    const args = [
      '--timed',
      String(SAMPLE_SECONDS),
      '--terminate_after_timed',
      '--output_file',
      outputFile,
      '--no_console_stats',
      '--stop_existing_session',
      '--exclude_dropped',
      '--v1_metrics',
    ];
    if (shouldTarget) args.unshift('--process_id', String(foreground.pid));
    return args;
  }

  const args = [
    '-timed',
    String(SAMPLE_SECONDS),
    '-terminate_after_timed',
    '-output_file',
    outputFile,
    '-no_top',
    '-stop_existing_session',
    '-exclude_dropped',
    '-simple',
  ];
  if (shouldTarget) args.unshift('-process_id', String(foreground.pid));
  return args;
}

function parseCsvLine(line) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      out.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  out.push(value);
  return out;
}

function parseCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index];
    });
    return row;
  });
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function applicationKey(row) {
  return `${row.Application || '<unknown>'}:${row.ProcessID || ''}`;
}

function isUsefulAppName(name) {
  const normalized = String(name || '').toLowerCase();
  return normalized && normalized !== '<unknown>' && !IGNORE_APPS.has(normalized);
}

function chooseRows(rows, foreground) {
  const validRows = rows.filter((row) => {
    const ms = toNumber(row.msBetweenPresents || row['msBetweenPresents']);
    return ms != null && ms > 0 && ms < 1000;
  });
  if (!validRows.length) return [];

  if (foreground && foreground.pid) {
    const pidRows = validRows.filter((row) => Number(row.ProcessID) === Number(foreground.pid));
    if (pidRows.length >= 2) return pidRows;
  }

  if (foreground && foreground.exeName) {
    const name = String(foreground.exeName).toLowerCase();
    const nameRows = validRows.filter(
      (row) => String(row.Application || '').toLowerCase() === name,
    );
    if (nameRows.length >= 2) return nameRows;
  }

  const groups = new Map();
  validRows.forEach((row) => {
    if (!isUsefulAppName(row.Application)) return;
    const key = applicationKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });

  return [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
}

function summarizeRows(rows) {
  const frameTimes = rows
    .map((row) => toNumber(row.msBetweenPresents))
    .filter((ms) => ms != null && ms > 0 && ms < 1000)
    .slice(-360);
  if (frameTimes.length < 2) return null;

  const frameRates = frameTimes.map((ms) => 1000 / ms).filter(Number.isFinite);
  if (!frameRates.length) return null;

  const fps = frameRates.reduce((sum, value) => sum + value, 0) / frameRates.length;
  const sorted = [...frameRates].sort((a, b) => a - b);
  const lowCount = Math.max(1, Math.floor(sorted.length * 0.01));
  const low1 = sorted.slice(0, lowCount).reduce((sum, value) => sum + value, 0) / lowCount;
  const last = rows[rows.length - 1] || {};

  return {
    fps: Math.round(fps),
    low1: Math.round(low1),
    sampleCount: frameRates.length,
    target: {
      application: last.Application || '',
      processId: Number(last.ProcessID) || null,
    },
  };
}

async function captureWithPresentMon(exePath, foreground) {
  const outputFile = path.join(os.tmpdir(), `nexus-presentmon-${process.pid}-${Date.now()}.csv`);
  try {
    const result = await execFileCapture(exePath, presentMonArgs(exePath, outputFile, foreground), {
      timeout: 5500,
    });
    if (!result.ok && !fs.existsSync(outputFile)) {
      return {
        ok: false,
        error:
          result.stderr ||
          result.stdout ||
          result.error ||
          `PresentMon exited with code ${result.code}`,
      };
    }

    const csv = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf-8') : result.stdout;
    const rows = parseCsv(csv);
    const selectedRows = chooseRows(rows, foreground);
    const summary = summarizeRows(selectedRows);
    if (!summary) {
      return {
        ok: false,
        error: rows.length
          ? 'PresentMon did not capture enough displayed frames for the foreground app.'
          : 'PresentMon produced no frame rows.',
      };
    }

    return {
      ok: true,
      ...summary,
      source: path.basename(exePath),
      foreground,
    };
  } finally {
    try {
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    } catch (_) {
      // Temp cleanup is best-effort.
    }
  }
}

async function getFpsMetrics(options = {}) {
  if (options.enabled === false) {
    return {
      fps: null,
      low1: null,
      available: false,
      source: 'disabled',
      message: 'FPS overlay is disabled.',
    };
  }

  if (cached.value && Date.now() - cached.at < CACHE_MS) return cached.value;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const exePath = await findPresentMon();
    if (!exePath) {
      return {
        fps: null,
        low1: null,
        available: false,
        source: 'presentmon-not-found',
        message: 'PresentMon is not installed.',
      };
    }

    const foreground = await getForegroundProcess();
    const captured = await captureWithPresentMon(exePath, foreground);
    const value = captured.ok
      ? {
          fps: captured.fps,
          low1: captured.low1,
          available: true,
          source: captured.source,
          target: captured.target,
          sampleCount: captured.sampleCount,
          foreground: captured.foreground,
        }
      : {
          fps: null,
          low1: null,
          available: false,
          source: path.basename(exePath),
          message: captured.error || 'PresentMon capture failed.',
          foreground,
        };

    cached = { at: Date.now(), value };
    return value;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

module.exports = {
  getFpsMetrics,
  findPresentMon,
};
