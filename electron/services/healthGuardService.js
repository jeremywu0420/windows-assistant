'use strict';

const systemMonitorService = require('./systemMonitorService');
const notificationService = require('./notificationService');

let timer = null;
let lastAlerts = new Map();

function bytesToGb(bytes) {
  return bytes / 1024 / 1024 / 1024;
}

function getConfig(settings = {}) {
  const guard = settings.healthGuard || {};
  return {
    enabled: guard.enabled !== false,
    mode: guard.mode || 'normal',
    intervalMinutes: Math.max(1, Number(guard.intervalMinutes || 5)),
    cooldownMinutes: Math.max(5, Number(guard.cooldownMinutes || 30)),
    cpuTempC: Math.max(50, Number(guard.cpuTempC || 85)),
    gpuTempC: Math.max(50, Number(guard.gpuTempC || 85)),
    ramPercent: Math.max(50, Number(guard.ramPercent || 85)),
    diskFreeGb: Math.max(1, Number(guard.diskFreeGb || 50)),
    diskFreePercent: Math.max(5, Number(guard.diskFreePercent || 15)),
  };
}

function canAlert(key, cooldownMinutes) {
  const now = Date.now();
  const last = lastAlerts.get(key) || 0;
  if (now - last < cooldownMinutes * 60 * 1000) return false;
  lastAlerts.set(key, now);
  return true;
}

async function check(settings = {}) {
  const config = getConfig(settings);
  if (!config.enabled) return { ok: true, enabled: false, alerts: [] };

  const metrics = await systemMonitorService.getMetrics({
    monitorDrives: settings.general && settings.general.monitorDrives,
    monitorDrive: settings.general && settings.general.monitorDrive,
  });
  const alerts = [];

  const hotCpu = (metrics.temperatures?.cpuCores || []).filter(
    (sensor) => sensor.temperatureC >= config.cpuTempC,
  );
  if (hotCpu.length) {
    alerts.push({
      key: 'cpu-temp',
      level: 'danger',
      title: 'CPU 溫度過高',
      body: `${hotCpu.length} 個 CPU 核心高於 ${config.cpuTempC}°C，最高 ${Math.max(...hotCpu.map((item) => item.temperatureC))}°C。`,
      action: 'monitor',
    });
  }

  const hotGpu = (metrics.temperatures?.gpu || []).filter(
    (sensor) => sensor.temperatureC >= config.gpuTempC,
  );
  if (hotGpu.length) {
    alerts.push({
      key: 'gpu-temp',
      level: 'danger',
      title: 'GPU 溫度過高',
      body: `${hotGpu[0].name || 'GPU'} 目前 ${hotGpu[0].temperatureC}°C，高於門檻 ${config.gpuTempC}°C。`,
      action: 'monitor',
    });
  }

  if (metrics.memory.usagePercent >= config.ramPercent) {
    alerts.push({
      key: 'ram',
      level: 'warn',
      title: 'RAM 使用率偏高',
      body: `目前 RAM 使用率 ${metrics.memory.usagePercent}%，高於門檻 ${config.ramPercent}%。`,
      action: 'monitor',
    });
  }

  for (const drive of metrics.disks || []) {
    if (!drive.ok) continue;
    const freeGb = bytesToGb(drive.free);
    if (freeGb <= config.diskFreeGb || drive.freePercent <= config.diskFreePercent) {
      alerts.push({
        key: `disk-${drive.drive}`,
        level: 'warn',
        title: `${drive.drive} 磁碟空間偏低`,
        body: `${drive.drive} 剩餘 ${freeGb.toFixed(1)} GB (${drive.freePercent}%)，建議前往 Clean Center 掃描。`,
        action: 'cleanup',
      });
    }
  }

  const fired = [];
  for (const alert of alerts) {
    if (!canAlert(alert.key, config.cooldownMinutes)) continue;
    notificationService.notify(alert.title, alert.body, {
      level: alert.level,
      source: 'health-guard',
      action: alert.action,
    });
    fired.push(alert);
  }

  return { ok: true, enabled: true, checkedAt: new Date().toISOString(), alerts, fired, metrics };
}

function start(getSettings, options = {}) {
  stop();
  const settings = typeof getSettings === 'function' ? getSettings() : {};
  const config = getConfig(settings);
  if (!config.enabled) return { ok: true, running: false };

  const run = () => {
    const latest = typeof getSettings === 'function' ? getSettings() : {};
    check(latest).catch((err) => {
      notificationService
        .addEvent({
          title: '健康守護檢查失敗',
          body: err.message,
          level: 'warn',
          source: 'health-guard',
        })
        .catch(() => {});
    });
  };
  if (options.runNow !== false) setTimeout(run, 5000);
  timer = setInterval(run, config.intervalMinutes * 60 * 1000);
  return { ok: true, running: true, intervalMinutes: config.intervalMinutes };
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function status(settings = {}) {
  const config = getConfig(settings);
  return { ok: true, running: !!timer, config };
}

module.exports = {
  start,
  stop,
  check,
  status,
  getConfig,
};
