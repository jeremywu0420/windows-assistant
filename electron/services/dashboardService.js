'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');

const activityHistoryService = require('./activityHistoryService');
const automationService = require('./automationService');
const cleanupService = require('./cleanupService');
const notificationService = require('./notificationService');
const projectService = require('./projectService');
const systemMonitorService = require('./systemMonitorService');

const app = electron.app;

const SCAN_LIMITS = {
  maxDepth: 3,
  maxFiles: 12000,
  maxDirs: 900,
};

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.cache',
  '.next',
  '.nuxt',
  'venv',
  '.venv',
  '__pycache__',
]);

const EXT_GROUPS = {
  Documents: new Set([
    '.doc',
    '.docx',
    '.pdf',
    '.txt',
    '.md',
    '.rtf',
    '.ppt',
    '.pptx',
    '.xls',
    '.xlsx',
    '.csv',
  ]),
  Images: new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.svg',
    '.tif',
    '.tiff',
    '.heic',
  ]),
  Videos: new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v']),
  Music: new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg']),
  Archives: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']),
  Code: new Set([
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs',
    '.py',
    '.java',
    '.cpp',
    '.c',
    '.h',
    '.hpp',
    '.cs',
    '.go',
    '.rs',
    '.html',
    '.css',
    '.json',
    '.yml',
    '.yaml',
    '.ps1',
    '.sh',
  ]),
};

function safeAppPath(name, fallbackName) {
  try {
    if (app && app.isReady()) return app.getPath(name);
  } catch (_) {
    /* fall through */
  }
  return path.join(os.homedir(), fallbackName);
}

function iso(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function statusForPercent(percent) {
  if (percent == null || !Number.isFinite(Number(percent))) return 'normal';
  if (percent >= 90) return 'danger';
  if (percent >= 75) return 'warning';
  if (percent <= 45) return 'good';
  return 'normal';
}

function statusForDisk(disk) {
  if (!disk || !disk.ok) return 'warning';
  if (disk.freePercent < 12) return 'danger';
  if (disk.freePercent < 25) return 'warning';
  if (disk.freePercent > 55) return 'good';
  return 'normal';
}

function statusForCount(count, warning, danger) {
  if (count >= danger) return 'danger';
  if (count >= warning) return 'warning';
  if (count > 0) return 'normal';
  return 'good';
}

async function statSafe(target) {
  try {
    return await fs.promises.stat(target);
  } catch (_) {
    return null;
  }
}

async function readDirSafe(target) {
  try {
    return await fs.promises.readdir(target, { withFileTypes: true });
  } catch (_) {
    return null;
  }
}

function emptyFolderStats(folderPath, label) {
  return {
    label,
    path: folderPath,
    count: 0,
    sizeBytes: 0,
    updatedAt: '',
    byExt: {},
    truncated: false,
    unavailable: false,
  };
}

async function scanFolder(folderPath, label) {
  const rootStat = await statSafe(folderPath);
  const stats = emptyFolderStats(folderPath, label);
  if (!rootStat || !rootStat.isDirectory()) {
    stats.unavailable = true;
    return stats;
  }

  let dirs = 0;

  async function walk(current, depth) {
    if (stats.count >= SCAN_LIMITS.maxFiles || dirs >= SCAN_LIMITS.maxDirs) {
      stats.truncated = true;
      return;
    }
    const entries = await readDirSafe(current);
    if (!entries) return;

    for (const entry of entries) {
      if (stats.count >= SCAN_LIMITS.maxFiles || dirs >= SCAN_LIMITS.maxDirs) {
        stats.truncated = true;
        return;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth >= SCAN_LIMITS.maxDepth || SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        dirs += 1;
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileStat = await statSafe(full);
      if (!fileStat) continue;
      const ext = path.extname(entry.name).toLowerCase() || '[none]';
      stats.count += 1;
      stats.sizeBytes += fileStat.size || 0;
      stats.byExt[ext] = (stats.byExt[ext] || 0) + 1;
      if (!stats.updatedAt || fileStat.mtimeMs > Date.parse(stats.updatedAt)) {
        stats.updatedAt = fileStat.mtime.toISOString();
      }
    }
  }

  await walk(folderPath, 0);
  return stats;
}

function node(input) {
  return {
    id: input.id,
    label: input.label,
    type: input.type,
    value: Number(input.value || 0),
    sizeBytes: input.sizeBytes,
    count: input.count,
    status: input.status || 'normal',
    path: input.path,
    updatedAt: input.updatedAt || '',
    route: input.route || 'dashboard',
    meta: input.meta || {},
  };
}

function fileNodeFromFolder(key, stats, route = 'files') {
  return node({
    id: `file-${key}`,
    label: stats.label,
    type: 'file',
    value: stats.sizeBytes || stats.count || 1,
    sizeBytes: stats.sizeBytes,
    count: stats.count,
    status: stats.unavailable ? 'warning' : statusForCount(stats.count, 500, 2000),
    path: stats.path,
    updatedAt: stats.updatedAt,
    route,
    meta: {
      truncated: stats.truncated,
      unavailable: stats.unavailable,
    },
  });
}

function categoryNode(name, aggregate) {
  return node({
    id: `file-category-${name.toLowerCase()}`,
    label: name,
    type: 'file',
    value: aggregate.sizeBytes || aggregate.count || 1,
    sizeBytes: aggregate.sizeBytes,
    count: aggregate.count,
    status: statusForCount(aggregate.count, 300, 1200),
    updatedAt: aggregate.updatedAt,
    route: name === 'Code' ? 'projects' : 'files',
    meta: { category: name },
  });
}

function aggregateExtensionGroups(folderStats) {
  const groups = Object.fromEntries(
    Object.keys(EXT_GROUPS).map((name) => [
      name,
      {
        count: 0,
        sizeBytes: 0,
        updatedAt: '',
      },
    ]),
  );

  for (const stats of folderStats) {
    for (const [ext, count] of Object.entries(stats.byExt || {})) {
      for (const [name, exts] of Object.entries(EXT_GROUPS)) {
        if (!exts.has(ext)) continue;
        groups[name].count += count;
        if (stats.sizeBytes && stats.count) {
          groups[name].sizeBytes += Math.round(
            (stats.sizeBytes / Math.max(1, stats.count)) * count,
          );
        }
        if (
          stats.updatedAt &&
          (!groups[name].updatedAt ||
            Date.parse(stats.updatedAt) > Date.parse(groups[name].updatedAt))
        ) {
          groups[name].updatedAt = stats.updatedAt;
        }
      }
    }
  }
  return groups;
}

async function getFileCategoryStats(cleanup) {
  const folderDefs = [
    ['desktop', 'Desktop', safeAppPath('desktop', 'Desktop'), 'files'],
    ['downloads', 'Downloads', safeAppPath('downloads', 'Downloads'), 'files'],
    ['documents', 'Documents', safeAppPath('documents', 'Documents'), 'files'],
    ['pictures', 'Pictures', safeAppPath('pictures', 'Pictures'), 'files'],
    ['videos', 'Videos', safeAppPath('videos', 'Videos'), 'files'],
    ['music', 'Music', safeAppPath('music', 'Music'), 'files'],
  ];

  const folderStats = await Promise.all(
    folderDefs.map(([, label, folderPath]) => scanFolder(folderPath, label)),
  );
  const byKey = {};
  folderDefs.forEach(([key], index) => {
    byKey[key] = folderStats[index];
  });

  const extGroups = aggregateExtensionGroups(folderStats);
  const folderNodes = folderDefs.map(([key, , , route], index) =>
    fileNodeFromFolder(key, folderStats[index], route),
  );
  const categoryNodes = Object.entries(extGroups)
    .filter(([, stats]) => stats.count > 0)
    .map(([name, stats]) => categoryNode(name, stats));

  const tempSize = Number(cleanup?.tempSize || 0);
  const tempNode = node({
    id: 'cleanup-temp-files',
    label: 'Temp Files',
    type: 'cleanup',
    value: tempSize || 1,
    sizeBytes: tempSize,
    count: undefined,
    status: tempSize > 3 * 1024 ** 3 ? 'warning' : 'normal',
    updatedAt: cleanup?.lastScanTime || '',
    route: 'cleanup',
  });

  return {
    folders: byKey,
    extensionGroups: extGroups,
    nodes: [...folderNodes, ...categoryNodes, tempNode],
  };
}

async function getProjectStats(config) {
  try {
    const result = await projectService.listProjects(config);
    const projects = result.ok ? result.projects || [] : [];
    const recent = [...projects]
      .sort((a, b) => Date.parse(b.lastModified || 0) - Date.parse(a.lastModified || 0))
      .slice(0, 7);
    const nodes = recent.map((project) =>
      node({
        id: `project-${Buffer.from(project.path || project.name || '')
          .toString('base64')
          .slice(0, 18)}`,
        label: project.name || path.basename(project.path || 'Project'),
        type: 'project',
        value: project.totalFileCount || project.detectedFileCount || 1,
        count: project.totalFileCount || project.detectedFileCount || 0,
        sizeBytes: project.sizeBytes || undefined,
        status: project.hasGit || project.isGitRepo ? 'good' : 'normal',
        path: project.path,
        updatedAt: project.lastModified,
        route: 'projects',
        meta: {
          category: project.category,
          tags: project.tags || [],
          hasGit: !!(project.hasGit || project.isGitRepo),
          scanTruncated: !!project.scanTruncated,
        },
      }),
    );

    return {
      ok: true,
      projects,
      nodes,
      gitRepoCount: projects.filter((project) => project.hasGit || project.isGitRepo).length,
      activeProjectCount: projects.length,
      pinnedProjects: projectService.normalizeProjectHub(config).pinnedProjects || [],
      recentProjects: recent,
      scanStatus: result.scanStatus,
    };
  } catch (err) {
    const configured = Array.isArray(config.projects) ? config.projects : [];
    return {
      ok: false,
      error: err.message,
      projects: configured,
      nodes: configured.slice(0, 5).map((project) =>
        node({
          id: `project-config-${Buffer.from(project.path || project.name || '')
            .toString('base64')
            .slice(0, 18)}`,
          label: project.name || path.basename(project.path || 'Project'),
          type: 'project',
          value: 1,
          status: 'warning',
          path: project.path,
          route: 'projects',
          meta: { unavailable: true },
        }),
      ),
      gitRepoCount: 0,
      activeProjectCount: configured.length,
      pinnedProjects: projectService.normalizeProjectHub(config).pinnedProjects || [],
      recentProjects: configured,
      scanStatus: null,
    };
  }
}

function systemNodes(metrics, health, cleanup) {
  const disk = (metrics?.disks || []).find((item) => item.ok) || null;
  const recycle = cleanup?.recycleBin || {};
  return [
    node({
      id: 'system-cpu',
      label: 'CPU',
      type: 'system',
      value: metrics?.cpu?.usagePercent ?? 0,
      count: metrics?.cpu?.cores,
      status: statusForPercent(metrics?.cpu?.usagePercent),
      updatedAt: new Date().toISOString(),
      route: 'monitor',
    }),
    node({
      id: 'system-memory',
      label: 'Memory',
      type: 'system',
      value: metrics?.memory?.usagePercent ?? 0,
      sizeBytes: metrics?.memory?.usedBytes,
      status: statusForPercent(metrics?.memory?.usagePercent),
      updatedAt: new Date().toISOString(),
      route: 'monitor',
    }),
    node({
      id: 'system-storage',
      label: 'Storage',
      type: 'system',
      value: disk?.usedPercent ?? 0,
      sizeBytes: disk?.used,
      status: statusForDisk(disk),
      path: disk?.drive,
      updatedAt: new Date().toISOString(),
      route: 'monitor',
    }),
    node({
      id: 'system-network',
      label: 'Network',
      type: 'system',
      value: 0,
      status: 'normal',
      updatedAt: new Date().toISOString(),
      route: 'monitor',
      meta: {
        unavailable: true,
        reason: 'Live network throughput is not exposed by the current backend.',
      },
    }),
    node({
      id: 'cleanup-cache',
      label: 'Cache',
      type: 'cleanup',
      value: 1,
      status: 'normal',
      updatedAt: cleanup?.lastScanTime || '',
      route: 'cleanup',
      meta: {
        unavailable: true,
        reason: 'Cache size is available after a Clean Center scan.',
      },
    }),
    node({
      id: 'cleanup-recycle-bin',
      label: 'Recycle Bin',
      type: 'cleanup',
      value: recycle.size || recycle.count || 1,
      sizeBytes: recycle.size || 0,
      count: recycle.count || 0,
      status: recycle.size > 2 * 1024 ** 3 ? 'warning' : 'normal',
      updatedAt: cleanup?.lastCleanupTime || '',
      route: 'cleanup',
    }),
    node({
      id: 'system-health',
      label: 'System Health',
      type: 'system',
      value: health?.score ?? 0,
      status:
        (health?.score ?? 0) >= 80 ? 'good' : (health?.score ?? 0) >= 60 ? 'warning' : 'danger',
      updatedAt: new Date().toISOString(),
      route: 'health',
    }),
  ];
}

function getAutomationNodes(config) {
  const rules = automationService.list(config);
  const enabled = rules.filter((rule) => rule && rule.enabled !== false);
  return {
    rules,
    nodes: [
      node({
        id: 'automation-rules',
        label: 'Automation Rules',
        type: 'automation',
        value: enabled.length || 1,
        count: enabled.length,
        status: enabled.length ? 'good' : 'normal',
        route: 'automations',
      }),
    ],
  };
}

function todayCount(rows) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return rows
    .filter((row) => {
      const date = new Date(row.time || row.at || 0);
      return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
    })
    .reduce((sum, row) => sum + Number(row.count || row.moved || 1), 0);
}

async function getDashboardStats(config) {
  const cleanup = await cleanupService
    .getStatus()
    .catch((err) => ({ ok: false, error: err.message }));
  const [metrics, activities, notifications] = await Promise.all([
    systemMonitorService.getMetrics({
      monitorDrives: config.general && config.general.monitorDrives,
      monitorDrive: config.general && config.general.monitorDrive,
    }),
    activityHistoryService
      .listHistory()
      .catch((err) => ({ ok: false, rows: [], error: err.message })),
    notificationService
      .listEvents()
      .catch((err) => ({ ok: false, events: [], unreadCount: 0, error: err.message })),
  ]);

  const fileStats = await getFileCategoryStats(cleanup);
  const projectStats = await getProjectStats(config);
  const downloadsCount = Number(fileStats.folders?.downloads?.count || 0);
  const health = systemMonitorService.computeHealthScore(metrics, {
    unsortedDownloads: downloadsCount,
    hasStaleProject: projectStats.projects.some(
      (project) => Number(project.hoursSinceCommit || 0) > 72,
    ),
  });
  const automation = getAutomationNodes(config);
  const organizedToday = todayCount(activities.rows || []);

  const organizedNode = node({
    id: 'activity-organized-today',
    label: 'Organized Today',
    type: 'automation',
    value: organizedToday || 1,
    count: organizedToday,
    status: organizedToday ? 'good' : 'normal',
    updatedAt: new Date().toISOString(),
    route: 'history',
  });

  const nodes = [
    ...fileStats.nodes,
    ...projectStats.nodes,
    ...systemNodes(metrics, health, cleanup),
    ...automation.nodes,
    organizedNode,
  ];

  const disk = (metrics.disks || []).find((item) => item.ok) || null;
  const totalFiles = Object.values(fileStats.folders).reduce(
    (sum, item) => sum + Number(item.count || 0),
    0,
  );
  const totalFileBytes = Object.values(fileStats.folders).reduce(
    (sum, item) => sum + Number(item.sizeBytes || 0),
    0,
  );

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    stats: {
      totalFiles,
      totalFileBytes,
      activeProjects: projectStats.activeProjectCount,
      gitRepos: projectStats.gitRepoCount,
      storageUsedPercent: disk ? disk.usedPercent : null,
      storageUsedBytes: disk ? disk.used : null,
      cacheSizeBytes: null,
      tempSizeBytes: cleanup?.tempSize ?? null,
      systemHealth: health.score,
      organizedToday,
      automationRules: automation.rules.length,
      enabledAutomations: automation.rules.filter((rule) => rule && rule.enabled !== false).length,
    },
    system: {
      metrics,
      health,
      cleanup,
    },
    files: fileStats,
    projects: projectStats,
    automation: {
      rules: automation.rules,
    },
    activities: activities.rows || [],
    notifications: {
      events: notifications.events || [],
      unreadCount: notifications.unreadCount || 0,
    },
    nodes,
    unavailable: [
      {
        key: 'networkUsage',
        reason: 'Live network throughput is not exposed by the current backend.',
      },
      {
        key: 'cacheSize',
        reason:
          'Cache size is available after a Clean Center scan, but no standalone cached total is exposed yet.',
      },
    ],
  };
}

module.exports = {
  getDashboardStats,
  getFileCategoryStats,
  getProjectStats,
};
