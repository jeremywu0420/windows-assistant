'use strict';

const os = require('os');
const { execFile } = require('child_process');
const systemMonitorService = require('./systemMonitorService');
const fpsService = require('./fpsService');

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 1) {
  const number = toNumber(value);
  if (number == null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function getCpuClockGhz() {
  const cpus = os.cpus();
  const speeds = cpus
    .map((cpu) => toNumber(cpu.speed))
    .filter((value) => value != null && value > 0);
  if (!speeds.length) return null;
  const averageMhz = speeds.reduce((sum, value) => sum + value, 0) / speeds.length;
  return round(averageMhz / 1000, 2);
}

function execNvidiaMetrics() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    execFile(
      'nvidia-smi',
      [
        '--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 2500, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const line = stdout
          .split(/\r?\n/)
          .map((row) => row.trim())
          .filter(Boolean)[0];
        if (!line) return resolve(null);
        const [usage, temperature, memoryUsedMb, memoryTotalMb] = line
          .split(',')
          .map((part) => part.trim());
        resolve({
          usagePercent: round(usage, 0),
          temperatureC: round(temperature, 0),
          vramUsedBytes:
            toNumber(memoryUsedMb) == null
              ? null
              : Math.round(toNumber(memoryUsedMb) * 1024 * 1024),
          vramTotalBytes:
            toNumber(memoryTotalMb) == null
              ? null
              : Math.round(toNumber(memoryTotalMb) * 1024 * 1024),
          source: 'nvidia-smi',
        });
      },
    );
  });
}

function hottestGpuFromTemperatures(metrics) {
  const values = ((metrics.temperatures || {}).gpu || [])
    .map((item) => toNumber(item.temperatureC))
    .filter((value) => value != null);
  if (!values.length) return null;
  return Math.max(...values);
}

function coreTempCpuTemperature(metrics) {
  const cpuCores = ((metrics || {}).temperatures || {}).cpuCores || [];
  const coreTempValues = cpuCores
    .filter((item) => item.source === 'Core Temp')
    .map((item) => toNumber(item.temperatureC))
    .filter((value) => value != null);
  if (coreTempValues.length) return Math.max(...coreTempValues);

  const cpuValues = cpuCores
    .map((item) => toNumber(item.temperatureC))
    .filter((value) => value != null);
  if (cpuValues.length) return Math.max(...cpuValues);
  return null;
}

async function getOverlayMetrics(config = {}) {
  const errors = [];
  let metrics = null;
  let fpsMetrics = null;
  let gpu = null;

  await Promise.all([
    systemMonitorService
      .getMetrics({
        monitorDrives: config.general && config.general.monitorDrives,
        monitorDrive: config.general && config.general.monitorDrive,
      })
      .then((value) => {
        metrics = value;
      })
      .catch((err) => {
        errors.push(`system metrics: ${err.message}`);
      }),
    fpsService
      .getFpsMetrics({ enabled: !config.overlay || config.overlay.showFps !== false })
      .then((value) => {
        fpsMetrics = value;
      })
      .catch((err) => {
        errors.push(`fps metrics: ${err.message}`);
        fpsMetrics = {
          fps: null,
          low1: null,
          available: false,
          source: 'presentmon',
          message: err.message,
        };
      }),
    execNvidiaMetrics()
      .then((value) => {
        gpu = value;
      })
      .catch((err) => {
        errors.push(`gpu metrics: ${err.message}`);
      }),
  ]);

  const memory =
    metrics && metrics.memory
      ? metrics.memory
      : {
          totalBytes: os.totalmem(),
          usedBytes: os.totalmem() - os.freemem(),
          usagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
        };

  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    fps: fpsMetrics || {
      fps: null,
      low1: null,
      available: false,
      source: 'presentmon-unavailable',
    },
    cpu: {
      usagePercent: metrics ? round(metrics.cpu && metrics.cpu.usagePercent, 0) : null,
      powerWatts: metrics
        ? round(metrics.temperatureSummary && metrics.temperatureSummary.cpuPowerWatts, 0)
        : null,
      powerSource: metrics
        ? (metrics.temperatureSummary && metrics.temperatureSummary.cpuPowerSource) || ''
        : '',
      temperatureC: metrics ? round(coreTempCpuTemperature(metrics), 0) : null,
      temperatureSource: metrics
        ? (metrics.temperatureSummary && metrics.temperatureSummary.cpuTemperatureSource) || ''
        : '',
      clockGhz: getCpuClockGhz(),
      cores: metrics ? metrics.cpu && metrics.cpu.cores : os.cpus().length,
    },
    gpu: {
      usagePercent: gpu ? gpu.usagePercent : null,
      temperatureC:
        gpu && gpu.temperatureC != null
          ? gpu.temperatureC
          : metrics
            ? round(hottestGpuFromTemperatures(metrics), 0)
            : null,
      vramUsedBytes: gpu ? gpu.vramUsedBytes : null,
      vramTotalBytes: gpu ? gpu.vramTotalBytes : null,
      source: gpu
        ? gpu.source
        : metrics && metrics.temperatureSummary && metrics.temperatureSummary.gpuAvailable
          ? 'temperature-sensor'
          : 'unavailable',
    },
    ram: {
      usedBytes: memory.usedBytes,
      totalBytes: memory.totalBytes,
      usagePercent: memory.usagePercent,
    },
    errors,
  };
}

module.exports = {
  getOverlayMetrics,
};
