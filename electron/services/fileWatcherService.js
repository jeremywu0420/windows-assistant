'use strict';

const fs = require('fs');
const path = require('path');

/**
 * File watcher service.
 * Watches a set of folders (non-recursive) and reports newly added files via a
 * callback. Supports pause/resume and clean restart. Errors on any single
 * folder never crash the watcher.
 */

let watchers = [];
let paused = false;
let onNewFile = null;
const recent = new Map(); // debounce duplicate fs events

function stop() {
  watchers.forEach((w) => {
    try {
      w.close();
    } catch (_) {
      /* noop */
    }
  });
  watchers = [];
}

function start(folders, cb) {
  stop();
  onNewFile = typeof cb === 'function' ? cb : null;
  const seen = new Set();
  (folders || []).forEach((folder) => {
    try {
      if (!folder || seen.has(folder) || !fs.existsSync(folder)) return;
      seen.add(folder);
      const w = fs.watch(folder, { persistent: false }, (event, filename) => {
        if (paused || !filename || !onNewFile) return;
        const full = path.join(folder, filename);
        const now = Date.now();
        if (recent.has(full) && now - recent.get(full) < 1500) return;
        recent.set(full, now);
        // Wait briefly so the file finishes writing before we stat it.
        setTimeout(() => {
          try {
            if (fs.existsSync(full) && fs.statSync(full).isFile()) {
              const stat = fs.statSync(full);
              onNewFile({
                folder,
                file: filename,
                path: full,
                size: stat.size,
                ext: path.extname(filename),
              });
            }
          } catch (_) {
            /* ignore transient files */
          }
        }, 400);
      });
      w.on('error', () => {});
      watchers.push(w);
    } catch (_) {
      /* skip unwatchable folder */
    }
  });
  return watchers.length;
}

function setPaused(p) {
  paused = !!p;
}
function isPaused() {
  return paused;
}
function watchedCount() {
  return watchers.length;
}

module.exports = { start, stop, setPaused, isPaused, watchedCount };
