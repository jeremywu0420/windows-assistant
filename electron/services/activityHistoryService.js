'use strict';

const path = require('path');
const cleanupService = require('./cleanupService');
const fileOrganizerService = require('./fileOrganizerService');
const { readOrganizerLogs } = require('./organizerLog');
const notificationService = require('./notificationService');

function asTime(value) {
  const stamp = new Date(value || Date.now()).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

async function listHistory() {
  const [downloads, screenshots, cleanup, notifications] = await Promise.all([
    fileOrganizerService.getHistory().catch(() => ({ history: [] })),
    readOrganizerLogs().catch(() => []),
    cleanupService.readCleanupLogs().catch(() => []),
    notificationService.listEvents().catch(() => ({ events: [] })),
  ]);

  const rows = [];

  for (const batch of downloads.history || []) {
    rows.push({
      id: batch.id || `downloads-${batch.organizedAt}`,
      time: batch.organizedAt,
      type: 'downloads',
      title: 'Downloads 檔案整理',
      summary: `移動 ${batch.summary?.moved || 0}，複製 ${batch.summary?.copied || 0}，跳過 ${batch.summary?.skipped || 0}，失敗 ${batch.summary?.failed || 0}`,
      count: batch.summary?.total || (batch.entries || []).length,
      restorable: (batch.entries || []).some((entry) => entry.mode !== 'copy'),
      details: batch,
    });
  }

  for (const batch of screenshots || []) {
    const items = batch.items || [];
    const moved = items.filter((item) => item.status === 'success').length;
    const failed = items.filter((item) => item.status === 'error').length;
    rows.push({
      id: `screenshots-${batch.time}`,
      time: batch.time,
      type: 'screenshots',
      title: '截圖整理',
      summary: `整理 ${moved}，失敗 ${failed}`,
      count: items.length,
      restorable: false,
      details: batch,
    });
  }

  for (const log of cleanup || []) {
    if (log.action !== 'clean-summary' && log.action !== 'clean') continue;
    rows.push({
      id: log.id || `cleanup-${log.time}-${log.filePath}`,
      time: log.time,
      type: 'cleanup',
      title:
        log.action === 'clean-summary'
          ? 'Clean Center 清理摘要'
          : `Clean Center ${log.category || ''}`,
      summary:
        log.action === 'clean-summary'
          ? `釋放 ${(Number(log.fileSize || 0) / 1024 / 1024).toFixed(1)} MB`
          : `${log.result || 'ok'} ${log.fileName || path.basename(log.filePath || '')}`,
      count: log.details?.successCount || 1,
      restorable: false,
      details: log,
    });
  }

  for (const event of notifications.events || []) {
    rows.push({
      id: event.id,
      time: event.time,
      type: 'notification',
      title: event.title,
      summary: event.body,
      count: 1,
      restorable: false,
      details: event,
    });
  }

  rows.sort((a, b) => asTime(b.time) - asTime(a.time));
  return {
    ok: true,
    rows: rows.slice(0, 250),
    downloadsHistoryPath: downloads.path || fileOrganizerService.historyPath(),
  };
}

async function restoreDownloadsLast() {
  const result = await fileOrganizerService.restoreLast();
  notificationService.notify(
    '復原中心',
    result.ok ? `已復原 ${result.restored || 0} 個 Downloads 整理項目` : result.error || '復原失敗',
    { level: result.ok ? 'ok' : 'warn', source: 'history' },
  );
  return result;
}

module.exports = {
  listHistory,
  restoreDownloadsLast,
};
