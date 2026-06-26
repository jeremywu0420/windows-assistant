'use strict';

/**
 * Smart Rules service (v1.1 — reminders only, no automatic destructive actions).
 *
 * Rules are stored as JSON inside user-settings.json under `rules`. Each rule is
 * evaluated against a live context (downloads count, RAM %, disk %, projects) and
 * produces an alert when its threshold is crossed.
 */

const DEFAULT_RULES = [
  {
    id: 'downloads-count',
    type: 'downloadsCount',
    label: 'Downloads 檔案數提醒',
    enabled: true,
    threshold: 50,
    level: 'warn',
  },
  {
    id: 'ram-usage',
    type: 'ramUsage',
    label: 'RAM 使用率提醒',
    enabled: true,
    threshold: 80,
    level: 'warn',
  },
  {
    id: 'project-stale',
    type: 'projectStale',
    label: '專案太久沒 commit 提醒',
    enabled: true,
    threshold: 24,
    level: 'warn',
  },
  {
    id: 'disk-free',
    type: 'diskFree',
    label: '磁碟剩餘空間提醒',
    enabled: true,
    threshold: 20,
    level: 'danger',
  },
];

const RULE_TYPES = {
  downloadsCount: { unit: '個', label: 'Downloads 檔案數超過' },
  ramUsage: { unit: '%', label: 'RAM 使用率超過' },
  projectStale: { unit: '小時', label: '專案未 commit 超過' },
  diskFree: { unit: '%', label: '磁碟剩餘空間低於' },
};

function getRules(config) {
  const rules = config && Array.isArray(config.rules) ? config.rules : [];
  return rules.length > 0 ? rules : DEFAULT_RULES;
}

/**
 * context = {
 *   downloadsCount, ramPercent,
 *   disks: [{ drive, freePercent, ok }],
 *   projects: [{ name, hoursSinceCommit }]
 * }
 * Returns { alerts: [{ ruleId, level, title, desc }] }
 */
function evaluate(config, context) {
  const rules = getRules(config);
  const ctx = context || {};
  const alerts = [];

  for (const rule of rules) {
    if (!rule || rule.enabled === false) continue;
    const threshold = Number(rule.threshold);
    const level = rule.level || 'warn';

    switch (rule.type) {
      case 'downloadsCount':
        if (ctx.downloadsCount > threshold) {
          alerts.push({
            ruleId: rule.id,
            level,
            title: `Downloads 有 ${ctx.downloadsCount} 個檔案（規則上限 ${threshold}）`,
            desc: '建議到「整理 Downloads」分類檔案。',
          });
        }
        break;
      case 'ramUsage':
        if (ctx.ramPercent > threshold) {
          alerts.push({
            ruleId: rule.id,
            level,
            title: `RAM 使用率 ${ctx.ramPercent}%（規則上限 ${threshold}%）`,
            desc: '考慮關閉部分程式以釋放記憶體。',
          });
        }
        break;
      case 'diskFree': {
        // One alert per drive below the threshold, so the user sees exactly
        // which disk is low (e.g. "C:\ 剩餘空間低於 20%").
        const disks = Array.isArray(ctx.disks) ? ctx.disks : [];
        for (const disk of disks) {
          if (disk.ok && disk.freePercent < threshold) {
            alerts.push({
              ruleId: rule.id,
              level,
              title: `${disk.drive} 剩餘空間低於 ${threshold}%（目前 ${disk.freePercent}%）`,
              desc: '建議清理檔案或移動到其他磁碟。',
            });
          }
        }
        break;
      }
      case 'projectStale': {
        const stale = (ctx.projects || []).filter(
          (p) =>
            p.hoursSinceCommit !== null &&
            p.hoursSinceCommit !== undefined &&
            p.hoursSinceCommit >= threshold,
        );
        if (stale.length > 0) {
          alerts.push({
            ruleId: rule.id,
            level,
            title: `${stale.length} 個專案超過 ${threshold} 小時沒 commit`,
            desc: stale.map((p) => p.name).join('、'),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return { alerts };
}

module.exports = {
  DEFAULT_RULES,
  RULE_TYPES,
  getRules,
  evaluate,
};
