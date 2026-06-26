'use strict';

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const notificationService = require('./notificationService');
const fileOrganizerService = require('./fileOrganizerService');
const screenshotService = require('./screenshotService');
const cleanupService = require('./cleanupService');
const { classifyFile } = require('./fileClassifier');

const scheduledState = new Map();
let scheduleTimer = null;

function list(config) {
  return config && Array.isArray(config.automations) ? config.automations : [];
}

function matches(condition, info) {
  if (!condition) return false;
  switch (condition.type) {
    case 'extension': {
      const want = String(condition.value || '')
        .trim()
        .toLowerCase();
      if (!want) return false;
      const norm = want.startsWith('.') ? want : `.${want}`;
      return !!info.ext && info.ext.toLowerCase() === norm;
    }
    case 'sizeGreaterThan': {
      const mb = Number(condition.value || 0);
      return Number(info.size || 0) > mb * 1024 * 1024;
    }
    case 'newFileInFolder':
      return true;
    case 'schedule':
      return true;
    default:
      return false;
  }
}

async function organizeFileByType(action, info) {
  const saved = await fileOrganizerService.getSettings();
  const rootPath = action && action.rootPath ? action.rootPath : info.folder;
  const settings = {
    ...(saved.settings || {}),
    folderPath: rootPath,
    subdivideDocuments: action && action.subdivideDocuments === false ? false : true,
  };
  const classification = classifyFile(info.file, settings);
  const targetDir = path.join(rootPath, ...classification.targetSegments);
  const res = await fileOrganizerService.organize(
    [
      {
        name: info.file,
        sourcePath: info.path,
        targetDir,
        category: classification.category,
        categoryPath: classification.categoryPath,
        rootPath,
      },
    ],
    settings,
  );
  const first = res.results && res.results[0];
  return {
    ok: res.ok,
    moved: res.moved || 0,
    copied: res.copied || 0,
    skipped: res.skipped || 0,
    target: first && first.to,
    error: res.historyError || (first && first.error),
  };
}

async function organizeFolderByType(action, info) {
  const saved = await fileOrganizerService.getSettings();
  const rootPath =
    (action && action.rootPath) || info.folder || (saved.settings && saved.settings.folderPath);
  if (!rootPath) return { ok: false, error: 'Folder is not set.' };
  const settings = {
    ...(saved.settings || {}),
    folderPath: rootPath,
    includeSubfolders: action && action.includeSubfolders === true,
    subdivideDocuments: action && action.subdivideDocuments === false ? false : true,
  };
  const scan = await fileOrganizerService.scan(rootPath, settings);
  if (!scan.ok) return { ok: false, error: scan.error };
  if (!scan.items || scan.items.length === 0) {
    return {
      ok: true,
      moved: 0,
      copied: 0,
      skipped: scan.skippedFiles || 0,
      total: 0,
      message: 'No files to organize.',
    };
  }
  const res = await fileOrganizerService.organize(scan.items, settings);
  notificationService.notify(
    'Downloads 自動整理',
    `已整理 ${res.moved || res.copied || 0} 個檔案。`,
  );
  return {
    ok: res.ok,
    moved: res.moved || 0,
    copied: res.copied || 0,
    skipped: res.skipped || 0,
    failed: res.failed || 0,
    total: res.total || scan.items.length,
    error: res.historyError,
  };
}

async function organizeScreenshotByDate(config, action, info) {
  const settings = screenshotService.getSettings(
    config,
    action && action.settings ? action.settings : {},
  );
  const scan = await screenshotService.scanScreenshots(info.folder, {
    settings: {
      ...settings,
      includeSubfolders: false,
      skipAlreadyOrganized: true,
    },
    keywordMap: screenshotService.getKeywordMap(config),
  });
  if (!scan.ok) return { ok: false, error: scan.error };

  const sourceKey = path.resolve(info.path).toLowerCase();
  const item = (scan.items || []).find(
    (candidate) => path.resolve(candidate.sourcePath).toLowerCase() === sourceKey,
  );
  if (!item) {
    return {
      ok: true,
      skipped: 1,
      message: 'This screenshot is already organized or is not part of the scan result.',
    };
  }

  const res = await screenshotService.organizeScreenshots([item], { settings });
  const first = res.results && res.results[0];
  return {
    ok: res.ok,
    moved: res.moved || 0,
    skipped: res.skipped || 0,
    target: first && first.to,
    error: res.logError || (first && first.error),
  };
}

async function organizeScreenshotFolder(config, action, info) {
  const folder =
    info.folder || (action && action.rootPath) || screenshotService.getScreenshotsPath(config);
  if (!folder) return { ok: false, error: 'Screenshots folder is not set.' };
  const settings = screenshotService.getSettings(
    config,
    action && action.settings ? action.settings : {},
  );
  const scan = await screenshotService.scanScreenshots(folder, {
    settings: {
      ...settings,
      includeSubfolders: action && action.includeSubfolders === true,
      skipAlreadyOrganized: true,
    },
    keywordMap: screenshotService.getKeywordMap(config),
  });
  if (!scan.ok) return { ok: false, error: scan.error };
  if (!scan.items || scan.items.length === 0) {
    return {
      ok: true,
      moved: 0,
      skipped: scan.skippedFiles || 0,
      total: 0,
      message: 'No screenshots to organize.',
    };
  }
  const res = await screenshotService.organizeScreenshots(scan.items, { settings });
  notificationService.notify('截圖自動整理', `已整理 ${res.moved || 0} 張截圖。`);
  return {
    ok: res.ok,
    moved: res.moved || 0,
    skipped: res.skipped || 0,
    failed: res.failed || 0,
    total: res.total || scan.items.length,
    error: res.logError,
  };
}

async function runCleanupScan(type, notifyTitle) {
  const res = await cleanupService.runAutomationAction(type);
  const size = (res.items || []).reduce((sum, item) => sum + Number(item.size || 0), 0);
  notificationService.notify(
    'Clean Center',
    `${notifyTitle}: ${(res.items || []).length} item(s), ${(size / 1024 / 1024).toFixed(1)} MB.`,
  );
  return { ok: res.ok, count: (res.items || []).length, size };
}

async function runAction(action, info, config = {}) {
  try {
    switch (action && action.type) {
      case 'move': {
        if (!action.target) return { ok: false, error: 'Target folder is not set.' };
        await fs.promises.mkdir(action.target, { recursive: true });
        const res = await fileOrganizerService.organize([
          { name: info.file, sourcePath: info.path, targetDir: action.target, category: '' },
        ]);
        return { ok: res.ok, error: res.results && res.results[0] && res.results[0].error };
      }
      case 'notify':
        notificationService.notify(
          'Automation triggered',
          `${info.file} matched an automation rule.`,
        );
        return { ok: true };
      case 'openFolder':
        await shell.openPath(info.folder);
        return { ok: true };
      case 'organizeFileByType':
        if (!info || !info.path) return organizeFolderByType(action, info || {});
        return organizeFileByType(action, info);
      case 'organizeScreenshotByDate':
        if (!info || !info.path) return organizeScreenshotFolder(config, action, info || {});
        return organizeScreenshotByDate(config, action, info);
      case 'cleanupScanTemp':
        return runCleanupScan('scanTemp', 'Temp scan');
      case 'cleanupScanCache':
        return runCleanupScan('scanCache', 'Browser cache scan');
      case 'cleanupScanLargeFiles': {
        const res = await cleanupService.runAutomationAction('scanLargeFiles');
        notificationService.notify(
          'Clean Center',
          `Large file analysis found ${(res.items || []).length} file(s).`,
        );
        return { ok: res.ok, count: (res.items || []).length };
      }
      case 'cleanupScanDuplicates': {
        const res = await cleanupService.runAutomationAction('scanDuplicateFiles');
        notificationService.notify(
          'Clean Center',
          `Duplicate check found ${(res.groups || []).length} group(s).`,
        );
        return { ok: res.ok, count: (res.groups || []).length };
      }
      case 'cleanupReminder':
        notificationService.notify('Clean Center', 'Please review Clean Center recommendations.');
        return { ok: true };
      case 'cleanupScanSafe': {
        const res = await cleanupService.scan({ settings: { scanDuplicateFiles: false } });
        const safe = (res.items || []).filter((item) => item.selectedDefault);
        const size = safe.reduce((sum, item) => sum + Number(item.size || 0), 0);
        notificationService.notify(
          'Clean Center 安全掃描',
          `找到 ${safe.length} 個可安全清理項目，約 ${(size / 1024 / 1024).toFixed(1)} MB。`,
          {
            level: safe.length ? 'info' : 'ok',
            source: 'automation',
            action: 'cleanup',
          },
        );
        return { ok: res.ok, count: safe.length, size };
      }
      case 'projectScanReminder':
        notificationService.notify(
          'Project Hub',
          '建議重新掃描專案根目錄，確認 Git 狀態與常用專案。',
          {
            level: 'info',
            source: 'automation',
            action: 'projects',
          },
        );
        return { ok: true };
      case 'healthGuardCheck':
        notificationService.notify('健康守護', '排程健康檢查已觸發，請到每日工作台查看最新狀態。', {
          level: 'info',
          source: 'automation',
          action: 'dashboard',
        });
        return { ok: true };
      case 'cleanupNotifyTempOver': {
        const thresholdMb = Number(action.target || action.thresholdMb || 1024);
        const res = await cleanupService.runAutomationAction('checkTempSize', {
          thresholdBytes: thresholdMb * 1024 * 1024,
        });
        if (res.exceeded)
          notificationService.notify(
            'Clean Center',
            `Temp files exceeded ${thresholdMb} MB. Consider running Clean Center.`,
          );
        return res;
      }
      case 'cleanupNotifyRecycleOver': {
        const thresholdGb = Number(action.target || action.thresholdGb || 2);
        const res = await cleanupService.runAutomationAction('checkRecycleBinSize', {
          thresholdBytes: thresholdGb * 1024 * 1024 * 1024,
        });
        if (res.exceeded)
          notificationService.notify(
            'Clean Center',
            `Recycle Bin exceeded ${thresholdGb} GB. Consider reviewing it.`,
          );
        return res;
      }
      case 'cleanupNotifyDownloadsCount': {
        const thresholdCount = Number(action.target || action.thresholdCount || 200);
        const res = await cleanupService.runAutomationAction('checkDownloadsCount', {
          thresholdCount,
        });
        if (res.exceeded)
          notificationService.notify(
            'Clean Center',
            `Downloads has more than ${thresholdCount} files. Consider organizing it.`,
          );
        return res;
      }
      default:
        return { ok: false, error: 'Unsupported automation action.' };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function runRule(rule, config = {}) {
  if (!rule || rule.enabled === false) return { ok: false, error: 'Automation rule is disabled.' };
  const condition = rule.condition || {};
  const folder = condition.folder || '';
  const info = {
    file: '',
    path: '',
    folder,
    ext: '',
    size: 0,
    manual: true,
  };
  const result = await runAction(rule.action || {}, info, config);
  return { rule: rule.name, ...result };
}

async function handleNewFile(config, info) {
  const rules = list(config).filter((rule) => rule && rule.enabled !== false);
  const fired = [];
  for (const rule of rules) {
    const cond = rule.condition || {};
    if (cond.type === 'newFileInFolder' && cond.folder) {
      try {
        if (path.resolve(cond.folder) !== path.resolve(info.folder)) continue;
      } catch (_) {
        continue;
      }
    }
    if (matches(cond, info)) {
      const result = await runAction(rule.action || {}, info, config);
      fired.push({ rule: rule.name, ...result });
    }
  }
  return fired;
}

function minutesSinceStartOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function parseTimeMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return (
    Math.max(0, Math.min(23, Number(match[1]))) * 60 + Math.max(0, Math.min(59, Number(match[2])))
  );
}

function scheduleDue(rule, now = new Date()) {
  const condition = rule.condition || {};
  if (condition.type !== 'schedule') return false;
  const key = rule.id || rule.name;
  const last = scheduledState.get(key) || 0;
  const intervalMs = Math.max(1, Number(condition.everyMinutes || 0)) * 60 * 1000;
  const mode = condition.scheduleMode || 'interval';

  if (mode === 'interval') {
    return Date.now() - last >= intervalMs;
  }

  const targetMinutes = parseTimeMinutes(condition.time || '09:00');
  const currentMinutes = minutesSinceStartOfDay(now);
  const withinWindow = currentMinutes >= targetMinutes && currentMinutes <= targetMinutes + 1;
  if (!withinWindow) return false;

  if (mode === 'weekly') {
    const day = Number(condition.dayOfWeek || 1);
    if (now.getDay() !== day) return false;
  }

  return Date.now() - last >= 22 * 60 * 60 * 1000;
}

async function handleSchedules(config) {
  const rules = list(config).filter(
    (rule) =>
      rule && rule.enabled !== false && rule.condition && rule.condition.type === 'schedule',
  );
  const fired = [];
  for (const rule of rules) {
    if (!scheduleDue(rule)) continue;
    const key = rule.id || rule.name;
    scheduledState.set(key, Date.now());
    const result = await runAction(
      rule.action || {},
      {
        file: '',
        path: '',
        folder: '',
        ext: '',
        size: 0,
        scheduled: true,
      },
      config,
    );
    fired.push({ rule: rule.name, ...result });
  }
  return fired;
}

function startScheduler(getConfig, onFired) {
  stopScheduler();
  const tick = async () => {
    const config = typeof getConfig === 'function' ? getConfig() : {};
    if (config.general && config.general.automationsEnabled === false) return;
    const fired = await handleSchedules(config);
    if (fired.length && typeof onFired === 'function') onFired(fired);
  };
  scheduleTimer = setInterval(() => tick().catch(() => {}), 60 * 1000);
  setTimeout(() => tick().catch(() => {}), 3000);
  return { ok: true };
}

function stopScheduler() {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = null;
}

/**
 * Whether a schedule defined by `condition` ({ scheduleMode, everyMinutes, time,
 * dayOfWeek }) is due for the given dedupe `key`. Lets the workflow scheduler
 * reuse the exact same timing + once-per-window dedupe as flat automations.
 */
function scheduleDueFor(key, condition, now = new Date()) {
  return scheduleDue({ id: key, condition: { type: 'schedule', ...(condition || {}) } }, now);
}

/** Record that the schedule for `key` just fired (resets its dedupe window). */
function markScheduleFired(key) {
  scheduledState.set(key, Date.now());
}

module.exports = {
  list,
  matches,
  runAction,
  runRule,
  handleNewFile,
  handleSchedules,
  startScheduler,
  stopScheduler,
  scheduleDueFor,
  markScheduleFired,
};
