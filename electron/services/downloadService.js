'use strict';

const fs = require('fs');
const path = require('path');
const fileOrganizerService = require('./fileOrganizerService');

/**
 * Download organizer service (public API for the Downloads feature).
 * Delegates scanning/categorisation/moving to fileOrganizerService and adds
 * statistics + undo of the last organize batch.
 */

function buildStats(scanResult) {
  // scanResult.byCategory already has counts; expose as a sorted array.
  const byCategory = (scanResult && scanResult.byCategory) || {};
  return Object.keys(byCategory)
    .map((category) => ({ category, count: byCategory[category] }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Undo a previous organize batch by moving each successfully-moved file back to
 * its original location. Never overwrites — collisions get an incrementing suffix.
 * `results` is the `results` array returned by organize() (entries with from/to/status).
 */
function undo(results) {
  const out = [];
  let restored = 0;
  let failed = 0;

  for (const r of results || []) {
    if (!r || r.status !== 'moved') continue;
    try {
      if (!fs.existsSync(r.to)) throw new Error('檔案已不存在（可能已被移動或刪除）');
      const destDir = path.dirname(r.from);
      fs.mkdirSync(destDir, { recursive: true });

      let dest = r.from;
      if (fs.existsSync(dest)) {
        const ext = path.extname(r.from);
        const base = path.basename(r.from, ext);
        let i = 1;
        do {
          dest = path.join(destDir, `${base}(${i})${ext}`);
          i += 1;
        } while (fs.existsSync(dest));
      }

      try {
        fs.renameSync(r.to, dest);
      } catch (err) {
        if (err.code === 'EXDEV') {
          fs.copyFileSync(r.to, dest);
          fs.unlinkSync(r.to);
        } else {
          throw err;
        }
      }

      restored += 1;
      out.push({ name: r.name, from: r.to, to: dest, status: 'restored' });
    } catch (err) {
      failed += 1;
      out.push({ name: r ? r.name : '(未知)', status: 'error', error: err.message });
    }
  }

  return { ok: failed === 0, restored, failed, results: out };
}

module.exports = {
  CATEGORY_RULES: fileOrganizerService.CATEGORY_RULES,
  scan: fileOrganizerService.scan,
  organize: fileOrganizerService.organize,
  countUnsorted: fileOrganizerService.countUnsorted,
  categoryForExt: fileOrganizerService.categoryForExt,
  detectDownloads: fileOrganizerService.detectDownloads,
  resolveDownloadsPath: fileOrganizerService.resolveDownloadsPath,
  buildStats,
  undo,
};
