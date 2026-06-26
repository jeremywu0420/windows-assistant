'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Git / backup reminder service.
 *
 * - Read only: never commits, pushes, or modifies anything.
 * - Runs `git status --porcelain` and `git log -1` for each configured project.
 * - Degrades gracefully when a path is missing or is not a git repository.
 */

function runGit(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: (stderr || err.message || '').trim(), stdout: '' });
      } else {
        resolve({ ok: true, stdout: stdout || '' });
      }
    });
  });
}

async function checkProject(project) {
  const base = {
    name: project && project.name ? project.name : '(未命名)',
    path: project ? project.path : '',
    isGitRepo: false,
    exists: false,
    modifiedCount: 0,
    hoursSinceCommit: null,
    lastCommitISO: null,
    gitReminder: false,
    backupReminder: false,
    messages: [],
    error: null,
  };

  if (!project || !project.path) {
    base.error = '專案路徑未設定';
    return base;
  }

  // Path existence check (do not crash on a bad path).
  try {
    base.exists = fs.existsSync(project.path) && fs.statSync(project.path).isDirectory();
  } catch (err) {
    base.exists = false;
  }
  if (!base.exists) {
    base.error = `找不到資料夾：${project.path}`;
    return base;
  }

  // Is it a git repo?
  const inside = await runGit(['rev-parse', '--is-inside-work-tree'], project.path);
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    base.error = '此資料夾不是 git repository';
    return base;
  }
  base.isGitRepo = true;

  // Count modified / untracked files.
  const status = await runGit(['status', '--porcelain'], project.path);
  if (status.ok) {
    const lines = status.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    base.modifiedCount = lines.length;
  }

  // Last commit time (unix seconds).
  const log = await runGit(['log', '-1', '--format=%ct'], project.path);
  if (log.ok && log.stdout.trim()) {
    const ts = parseInt(log.stdout.trim(), 10);
    if (!Number.isNaN(ts)) {
      const last = new Date(ts * 1000);
      base.lastCommitISO = last.toISOString();
      base.hoursSinceCommit = (Date.now() - last.getTime()) / (1000 * 60 * 60);
    }
  } else {
    base.messages.push('尚未有任何 commit');
  }

  const gitReminderHours = Number(project.gitReminderHours) || 2;
  const backupReminderHours = Number(project.backupReminderHours) || 24;

  if (base.modifiedCount > 0) {
    base.gitReminder = true;
    base.messages.push(`有 ${base.modifiedCount} 個檔案尚未 commit`);
  }
  if (base.hoursSinceCommit !== null) {
    if (base.hoursSinceCommit >= gitReminderHours) {
      base.gitReminder = true;
      base.messages.push(
        `已超過 ${Math.floor(base.hoursSinceCommit)} 小時沒有 commit（設定 ${gitReminderHours} 小時）`,
      );
    }
    if (base.hoursSinceCommit >= backupReminderHours) {
      base.backupReminder = true;
      base.messages.push(
        `已超過 ${Math.floor(base.hoursSinceCommit)} 小時沒有備份（設定 ${backupReminderHours} 小時）`,
      );
    }
  }

  return base;
}

async function checkAll(projects) {
  if (!Array.isArray(projects) || projects.length === 0) {
    return { ok: true, projects: [], hasStaleProject: false };
  }
  const results = [];
  for (const project of projects) {
    // Sequential keeps it simple and avoids spawning too many git processes at once.
    results.push(await checkProject(project));
  }
  const hasStaleProject = results.some(
    (r) => r.isGitRepo && r.hoursSinceCommit !== null && r.hoursSinceCommit >= 24,
  );
  return { ok: true, projects: results, hasStaleProject };
}

module.exports = {
  checkProject,
  checkAll,
};
