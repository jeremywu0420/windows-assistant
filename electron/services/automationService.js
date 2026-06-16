'use strict';

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const notificationService = require('./notificationService');
const fileOrganizerService = require('./fileOrganizerService');

/**
 * Automation rules service.
 *
 * Rule shape:
 *   { id, name, enabled, condition: { type, value, folder }, action: { type, target },
 *     createdAt, updatedAt }
 * condition.type: 'extension' | 'sizeGreaterThan' (MB) | 'newFileInFolder'
 * action.type:    'move' (target folder) | 'notify' | 'openFolder'
 */

function list(config) {
  return config && Array.isArray(config.automations) ? config.automations : [];
}

function matches(condition, info) {
  if (!condition) return false;
  switch (condition.type) {
    case 'extension': {
      const want = String(condition.value || '').trim().toLowerCase();
      const norm = want.startsWith('.') ? want : `.${want}`;
      return !!info.ext && info.ext.toLowerCase() === norm;
    }
    case 'sizeGreaterThan': {
      const mb = Number(condition.value || 0);
      return info.size > mb * 1024 * 1024;
    }
    case 'newFileInFolder':
      return true; // folder scoping handled by caller
    default:
      return false;
  }
}

async function runAction(action, info) {
  try {
    switch (action && action.type) {
      case 'move': {
        if (!action.target) return { ok: false, error: '未設定目標資料夾' };
        fs.mkdirSync(action.target, { recursive: true });
        const res = fileOrganizerService.organize([
          { name: info.file, sourcePath: info.path, targetDir: action.target, category: '' },
        ]);
        return { ok: res.ok, error: res.results && res.results[0] && res.results[0].error };
      }
      case 'notify':
        notificationService.notify('自動化規則', `${info.file} 觸發了自動化規則`);
        return { ok: true };
      case 'openFolder':
        await shell.openPath(info.folder);
        return { ok: true };
      default:
        return { ok: false, error: '未知的動作類型' };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Run all enabled rules against a newly-detected file. Returns the rules that fired. */
async function handleNewFile(config, info) {
  const rules = list(config).filter((r) => r && r.enabled !== false);
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
      // eslint-disable-next-line no-await-in-loop
      const result = await runAction(rule.action || {}, info);
      fired.push({ rule: rule.name, ...result });
    }
  }
  return fired;
}

module.exports = { list, matches, runAction, handleNewFile };
