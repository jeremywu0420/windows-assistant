'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Structured logger.
 *
 * Replaces the ad-hoc `writeLog` that appended freeform strings to app.log.
 * Each entry is a single JSON line ({ ts, level, msg, ...meta }) which is far
 * easier to grep, tail, and post-process, while staying 100% local — nothing
 * leaves the machine. A small in-memory ring buffer keeps the most recent
 * entries so a future "diagnostics" panel can show them without re-reading the
 * file.
 *
 * The factory takes its side effects (writer, clock) as injected dependencies
 * so it can be unit-tested without touching the filesystem.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger({
  writeLine = () => {},
  now = () => new Date().toISOString(),
  capacity = 200,
  minLevel = 'info',
  enabled = () => true,
} = {}) {
  const ring = [];
  let threshold = LEVELS[minLevel] || LEVELS.info;

  function record(level, msg, meta) {
    const levelValue = LEVELS[level] || LEVELS.info;
    if (levelValue < threshold) return null;
    if (!enabled()) return null;
    const entry = {
      ts: now(),
      level,
      msg: String(msg),
      ...(meta && typeof meta === 'object' ? meta : {}),
    };
    ring.push(entry);
    if (ring.length > capacity) ring.shift();
    try {
      writeLine(JSON.stringify(entry));
    } catch (_) {
      /* never let logging crash the caller */
    }
    return entry;
  }

  return {
    LEVELS,
    debug: (msg, meta) => record('debug', msg, meta),
    info: (msg, meta) => record('info', msg, meta),
    warn: (msg, meta) => record('warn', msg, meta),
    error: (msg, meta) => record('error', msg, meta),
    log: record,
    /** Most recent entries (newest last), optionally filtered by min level. */
    recent: (level) => {
      if (!level) return ring.slice();
      const min = LEVELS[level] || 0;
      return ring.filter((e) => (LEVELS[e.level] || 0) >= min);
    },
    setMinLevel: (level) => {
      threshold = LEVELS[level] || threshold;
    },
    clear: () => {
      ring.length = 0;
    },
  };
}

/**
 * Default singleton wired to a rotating <userData>/logs/app.log. Lazily resolves
 * the Electron app path so it stays importable in plain Node tests (where the
 * file writer simply no-ops).
 */
function defaultFileWriter() {
  let electronApp = null;
  try {
    electronApp = require('electron').app || null;
  } catch (_) {
    /* not in Electron */
  }
  return (line) => {
    if (!electronApp) return;
    try {
      const dir = path.join(electronApp.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'app.log'), `${line}\n`, 'utf-8');
    } catch (_) {
      /* never let logging crash the app */
    }
  };
}

const logger = createLogger({ writeLine: defaultFileWriter() });

module.exports = { createLogger, logger, LEVELS };
