'use strict';

const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const hardwareSensorService = require('./hardwareSensorService');

const CPU_SAMPLE_MS = 1000;
const CPU_AVERAGE_WINDOW = 5;
const CPU_HISTORY_MAX = 10;
const SAMPLE_HISTORY_MAX = 90;
const cpuHistory = [];
const sampleHistory = [];
let processCache = { at: 0, data: { cpu: [], memory: [] } };

function cpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) total += cpu.times[type];
    idle += cpu.times.idle;
  }
  return { idle, total };
}

function averageRecentCpu() {
  const recent = cpuHistory.slice(-CPU_AVERAGE_WINDOW);
  if (!recent.length) return 0;
  return Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length);
}

function getCpuUsage(sampleMs = CPU_SAMPLE_MS) {
  return new Promise((resolve) => {
    const start = cpuTimes();
    setTimeout(() => {
      const end = cpuTimes();
      const idleDelta = end.idle - start.idle;
      const totalDelta = end.total - start.total;
      const usage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
      const bounded = Math.max(0, Math.min(100, usage));
      cpuHistory.push(bounded);
      if (cpuHistory.length > CPU_HISTORY_MAX) cpuHistory.shift();
      resolve(averageRecentCpu());
    }, sampleMs);
  });
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
  return { totalBytes: total, freeBytes: free, usedBytes: used, usagePercent };
}

function defaultDrivePath() {
  if (process.platform === 'win32') {
    const sysDrive = process.env.SystemDrive || 'C:';
    return sysDrive.endsWith('\\') ? sysDrive : `${sysDrive}\\`;
  }
  return '/';
}

async function getDiskUsage(targetPath) {
  const drivePath = targetPath && targetPath.trim() ? targetPath : defaultDrivePath();
  try {
    const stats = await fs.promises.statfs(drivePath);
    const blockSize = stats.bsize;
    const total = stats.blocks * blockSize;
    const free = stats.bavail * blockSize;
    const used = total - free;
    const freePercent = total > 0 ? Math.round((free / total) * 100) : 0;
    const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;
    return { ok: true, drive: drivePath, total, free, used, freePercent, usedPercent };
  } catch (err) {
    return {
      ok: false,
      drive: drivePath,
      error: `無法讀取磁碟資訊：${err.message}`,
      total: 0,
      free: 0,
      used: 0,
      freePercent: 0,
      usedPercent: 0,
    };
  }
}

async function detectDrives() {
  if (process.platform !== 'win32') return ['/'];
  const letters = [];
  for (let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
    letters.push(`${String.fromCharCode(code)}:\\`);
  }
  const checks = await Promise.all(
    letters.map(async (drive) => {
      try {
        await fs.promises.statfs(drive);
        return drive;
      } catch (_) {
        return null;
      }
    }),
  );
  const found = checks.filter(Boolean);
  return found.length > 0 ? found : [defaultDrivePath()];
}

async function resolveDrives(options = {}) {
  const { monitorDrives, monitorDrive } = options;
  let drives;
  if (Array.isArray(monitorDrives) && monitorDrives.some((drive) => drive && drive.trim())) {
    drives = monitorDrives.filter((drive) => drive && drive.trim());
  } else if (monitorDrive && monitorDrive.trim()) {
    drives = [monitorDrive.trim()];
  } else {
    drives = await detectDrives();
  }

  if (
    process.platform === 'win32' &&
    !drives.some((drive) => /^d:\\?$/i.test(String(drive).replace(/\//g, '\\')))
  ) {
    try {
      await fs.promises.statfs('D:\\');
      drives.push('D:\\');
    } catch (_) {
      // D: is not mounted.
    }
  }

  return Array.from(new Set(drives));
}

async function getDisksUsage(options = {}) {
  const drives = await resolveDrives(options);
  return Promise.all(drives.map((drive) => getDiskUsage(drive)));
}

function execPowerShellJson(script, timeout = 5000) {
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

function normalizeRows(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function getTopProcesses() {
  if (Date.now() - processCache.at < 15000) return processCache.data;
  const script = String.raw`
$rows = Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64,Path
$cpu = $rows | Sort-Object CPU -Descending | Select-Object -First 8
$mem = $rows | Sort-Object WorkingSet64 -Descending | Select-Object -First 8
[pscustomobject]@{ cpu = $cpu; memory = $mem } | ConvertTo-Json -Depth 4 -Compress
`;
  const parsed = await execPowerShellJson(script, 6000);
  const mapRow = (row) => ({
    pid: Number(row.Id || 0),
    name: row.ProcessName || 'Unknown',
    cpuSeconds: Math.round(Number(row.CPU || 0) * 10) / 10,
    memoryBytes: Number(row.WorkingSet64 || 0),
    path: row.Path || '',
  });
  const data = {
    cpu: normalizeRows(parsed && parsed.cpu).map(mapRow),
    memory: normalizeRows(parsed && parsed.memory).map(mapRow),
  };
  processCache = { at: Date.now(), data };
  return data;
}

function temperatureSummary(temperatures = {}) {
  const cpuCores = temperatures.cpuCores || [];
  const gpu = temperatures.gpu || [];
  const cpuValues = cpuCores.map((item) => Number(item.temperatureC)).filter(Number.isFinite);
  const gpuValues = gpu.map((item) => Number(item.temperatureC)).filter(Number.isFinite);
  const cpuPowerWatts = Number(temperatures.cpuPowerWatts);
  const avg = (rows) =>
    rows.length
      ? Math.round((rows.reduce((sum, value) => sum + value, 0) / rows.length) * 10) / 10
      : null;
  return {
    cpuAvailable: cpuValues.length > 0,
    gpuAvailable: gpuValues.length > 0,
    cpuCoreCount: cpuCores.length,
    hottestCpu: cpuValues.length ? Math.max(...cpuValues) : null,
    averageCpu: avg(cpuValues),
    cpuTemperatureSource: temperatures.cpuTemperatureSource || '',
    cpuPowerAvailable: Number.isFinite(cpuPowerWatts),
    cpuPowerWatts: Number.isFinite(cpuPowerWatts) ? Math.round(cpuPowerWatts * 10) / 10 : null,
    cpuPowerSource: temperatures.cpuPowerSource || '',
    hottestGpu: gpuValues.length ? Math.max(...gpuValues) : null,
    sources: temperatures.sources || [],
    message: temperatures.message || '',
  };
}

function hardwareSummary(temperatures = {}) {
  const cpu = os.cpus()[0] || {};
  const gpu = (temperatures.gpu || [])[0];
  return {
    hostname: os.hostname(),
    platform: process.platform,
    osType: os.type(),
    osRelease: os.release(),
    arch: os.arch(),
    cpuModel: cpu.model || 'Unknown CPU',
    cpuCores: os.cpus().length,
    ramBytes: os.totalmem(),
    gpuName: gpu ? gpu.name || gpu.hardware || 'GPU' : '',
    sensorSources: temperatures.sources || [],
  };
}

function pushSample(metrics) {
  const d = (metrics.disks || []).find(
    (disk) => disk.ok && /^d:\\?$/i.test(String(disk.drive || '').replace(/\//g, '\\')),
  );
  const c = (metrics.disks || []).find(
    (disk) => disk.ok && /^c:\\?$/i.test(String(disk.drive || '').replace(/\//g, '\\')),
  );
  sampleHistory.push({
    time: new Date().toISOString(),
    cpu: metrics.cpu.usagePercent,
    ram: metrics.memory.usagePercent,
    cpuTemp: metrics.temperatureSummary.hottestCpu,
    gpuTemp: metrics.temperatureSummary.hottestGpu,
    cFreePercent: c ? c.freePercent : null,
    dFreePercent: d ? d.freePercent : null,
  });
  while (sampleHistory.length > SAMPLE_HISTORY_MAX) sampleHistory.shift();
}

async function getMetrics(options = {}) {
  const [cpu, disks, temperatures, topProcesses] = await Promise.all([
    getCpuUsage(),
    getDisksUsage(options),
    hardwareSensorService.getTemperatures().catch((err) => ({
      ok: false,
      cpuCores: [],
      gpu: [],
      thermalZones: [],
      sources: [],
      message: err.message,
    })),
    getTopProcesses().catch(() => ({ cpu: [], memory: [] })),
  ]);

  const memory = getMemoryUsage();
  const metrics = {
    cpu: {
      usagePercent: cpu,
      sustainedHigh: cpuHistory.length >= 3 && cpuHistory.slice(-3).every((value) => value > 80),
      cores: os.cpus().length,
    },
    memory,
    disks,
    temperatures,
    temperatureSummary: temperatureSummary(temperatures),
    topProcesses,
    hardware: hardwareSummary(temperatures),
    uptimeSeconds: os.uptime(),
    hostname: os.hostname(),
    platform: process.platform,
    trends: [],
  };
  pushSample(metrics);
  metrics.trends = [...sampleHistory];
  return metrics;
}

function addDeduction(deductions, amount, reason, impact, action) {
  deductions.push({ reason, impact, action, points: -amount });
  return amount;
}

function computeHealthScore(metrics, extras = {}) {
  const { unsortedDownloads = 0, hasStaleProject = false } = extras;
  let score = 100;
  const deductions = [];

  if (metrics.memory.usagePercent > 85) {
    score -= addDeduction(
      deductions,
      12,
      `RAM 使用率 ${metrics.memory.usagePercent}% 超過 85%`,
      '大型程式可能變慢，系統會更常使用磁碟分頁。',
      '檢查 RAM Top List，關閉不需要的背景程式。',
    );
  } else if (metrics.memory.usagePercent > 75) {
    score -= addDeduction(
      deductions,
      6,
      `RAM 使用率 ${metrics.memory.usagePercent}% 偏高`,
      '仍可使用，但切換大型 App 時可能較慢。',
      '檢查 RAM Top List。',
    );
  }

  const lowDrives = (metrics.disks || []).filter(
    (drive) => drive.ok && (drive.freePercent < 15 || drive.free < 50 * 1024 * 1024 * 1024),
  );
  if (lowDrives.length > 0) {
    score -= addDeduction(
      deductions,
      15,
      `磁碟剩餘空間偏低：${lowDrives.map((drive) => `${drive.drive} ${drive.freePercent}%`).join(', ')}`,
      '下載、安裝、編譯與 Windows 更新可能失敗或變慢。',
      '前往 Clean Center 掃描暫存、大檔與回收桶。',
    );
  }

  if (metrics.cpu.sustainedHigh) {
    score -= addDeduction(
      deductions,
      10,
      'CPU 連續多次高於 80%',
      '目前可能有背景程式占用運算資源。',
      '檢查 CPU Top List。',
    );
  }

  const hotCpu = metrics.temperatureSummary?.hottestCpu;
  const hotGpu = metrics.temperatureSummary?.hottestGpu;
  if (hotCpu >= 90) {
    score -= addDeduction(
      deductions,
      14,
      `CPU 最高溫 ${hotCpu}°C 過高`,
      '可能降頻，長時間高溫也會影響穩定性。',
      '先暫停重負載工作，確認散熱與風扇。',
    );
  } else if (hotCpu >= 82) {
    score -= addDeduction(
      deductions,
      7,
      `CPU 最高溫 ${hotCpu}°C 偏高`,
      '重負載時可能接近降頻區間。',
      '降低背景負載或改善散熱。',
    );
  }

  if (hotGpu >= 88) {
    score -= addDeduction(
      deductions,
      12,
      `GPU 溫度 ${hotGpu}°C 過高`,
      '遊戲、影像處理或 AI 工作可能降頻。',
      '檢查 GPU 負載、風扇與機殼散熱。',
    );
  }

  if (unsortedDownloads > 50) {
    score -= addDeduction(
      deductions,
      5,
      `Downloads 有 ${unsortedDownloads} 個待整理項目`,
      '常用檔案會更難找，也可能累積大檔。',
      '執行檔案整理。',
    );
  }

  if (hasStaleProject) {
    score -= addDeduction(
      deductions,
      8,
      '有專案存在未提交變更',
      '工作進度可能尚未備份或同步。',
      '前往 Project Hub 檢查 Git 狀態。',
    );
  }

  score = Math.max(0, Math.min(100, score));
  let status = '狀態穩定';
  if (score < 60) status = '需要處理';
  else if (score < 80) status = '需要注意';
  return { score, status, deductions };
}

module.exports = {
  getCpuUsage,
  getMemoryUsage,
  getDiskUsage,
  getDisksUsage,
  detectDrives,
  resolveDrives,
  getMetrics,
  getTopProcesses,
  computeHealthScore,
  defaultDrivePath,
};
