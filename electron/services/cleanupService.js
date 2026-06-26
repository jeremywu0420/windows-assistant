'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
let electronApp = null;
let electronShell = null;
try {
  const electron = require('electron');
  electronApp = electron && electron.app ? electron.app : null;
  electronShell = electron && electron.shell ? electron.shell : null;
} catch (_) {
  // Keep this service importable in non-Electron smoke tests.
}

const SAFE = '安全清理';
const REVIEW = '建議確認';
const HIGH = '不建議自動清理';
const PERMANENT = '永久刪除';

const PROTECTED_ROOTS = [
  'C:\\Windows',
  'C:\\Windows\\System32',
  'C:\\Windows\\WinSxS',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
];

const PROTECTED_EXTS = new Set(['.exe', '.dll', '.sys', '.ini', '.config', '.json', '.db']);
const LOG_DUMP_EXTS = new Set(['.log', '.dmp', '.tmp', '.temp', '.bak', '.old']);
const LARGE_THRESHOLDS_MB = [100, 500, 1024];
const MAX_SCAN_FILES = 20000;
const MAX_DUPLICATE_CANDIDATES = 8000;
const LOG_LIMIT = 3000;
const DAY_MS = 24 * 60 * 60 * 1000;

function safeAppPath(name, fallbackName) {
  try {
    if (electronApp && electronApp.isReady()) return electronApp.getPath(name);
  } catch (_) {
    // fall through
  }
  return path.join(os.homedir(), fallbackName);
}

function appUserDataPath() {
  try {
    if (electronApp && electronApp.isReady()) return electronApp.getPath('userData');
  } catch (_) {
    // fall through
  }
  return path.join(os.tmpdir(), 'pc-life-assistant');
}

function appInstallPath() {
  try {
    if (electronApp && electronApp.isReady()) return electronApp.getAppPath();
  } catch (_) {
    // fall through
  }
  return process.cwd();
}

async function moveToRecycleBin(filePath) {
  if (!electronShell || typeof electronShell.trashItem !== 'function') {
    throw new Error('Recycle Bin is only available in the Electron runtime.');
  }
  return electronShell.trashItem(filePath);
}

function userDataPath(fileName) {
  return path.join(appUserDataPath(), fileName);
}

function cleanupSettingsPath() {
  return userDataPath('cleanupSettings.json');
}

function cleanupLogsPath() {
  return userDataPath('cleanupLogs.json');
}

function cleanupIgnoreListPath() {
  return userDataPath('cleanupIgnoreList.json');
}

function defaultScanFolders() {
  return [
    safeAppPath('downloads', 'Downloads'),
    safeAppPath('desktop', 'Desktop'),
    safeAppPath('documents', 'Documents'),
    safeAppPath('pictures', 'Pictures'),
    safeAppPath('videos', 'Videos'),
  ].filter(Boolean);
}

function defaultSettings() {
  return {
    safeMode: true,
    defaultScanFolders: defaultScanFolders(),
    largeFileThresholdMb: 100,
    cleanTemp: true,
    cleanBrowserCache: true,
    cleanThumbnailCache: true,
    scanLogDump: true,
    scanLargeFiles: true,
    scanDuplicateFiles: true,
    useRecycleBin: true,
    showHighRiskFiles: true,
    lowDiskThresholdGb: 20,
    lowDiskUsagePercent: 90,
    showCleanupReport: true,
    writeDetailedLog: true,
    disabledStartupItems: [],
  };
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    if (!value || typeof value !== 'string') continue;
    const key = path.normalize(value).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeSettings(input = {}) {
  const defaults = defaultSettings();
  const threshold = Number(input.largeFileThresholdMb || defaults.largeFileThresholdMb);
  return {
    ...defaults,
    ...input,
    safeMode: input.safeMode !== false,
    defaultScanFolders: uniqueStrings(
      Array.isArray(input.defaultScanFolders)
        ? input.defaultScanFolders
        : defaults.defaultScanFolders,
    ),
    largeFileThresholdMb: LARGE_THRESHOLDS_MB.includes(threshold)
      ? threshold
      : defaults.largeFileThresholdMb,
    cleanTemp: input.cleanTemp !== false,
    cleanBrowserCache: input.cleanBrowserCache !== false,
    cleanThumbnailCache: input.cleanThumbnailCache !== false,
    scanLogDump: input.scanLogDump !== false,
    scanLargeFiles: input.scanLargeFiles !== false,
    scanDuplicateFiles: input.scanDuplicateFiles !== false,
    useRecycleBin: input.useRecycleBin !== false,
    showHighRiskFiles: input.showHighRiskFiles !== false,
    lowDiskThresholdGb: Math.max(
      1,
      Number(input.lowDiskThresholdGb || defaults.lowDiskThresholdGb),
    ),
    lowDiskUsagePercent: Math.max(
      50,
      Math.min(99, Number(input.lowDiskUsagePercent || defaults.lowDiskUsagePercent)),
    ),
    showCleanupReport: input.showCleanupReport !== false,
    writeDetailedLog: input.writeDetailedLog !== false,
    disabledStartupItems: uniqueStrings(
      Array.isArray(input.disabledStartupItems) ? input.disabledStartupItems : [],
    ),
  };
}

async function loadCleanupSettings() {
  const target = cleanupSettingsPath();
  try {
    const raw = await fs.promises.readFile(target, 'utf-8');
    return { ok: true, path: target, settings: normalizeSettings(JSON.parse(raw)) };
  } catch (err) {
    if (err.code !== 'ENOENT')
      return { ok: false, path: target, settings: defaultSettings(), error: err.message };
    const settings = normalizeSettings();
    await saveCleanupSettings(settings);
    return { ok: true, path: target, settings };
  }
}

async function saveCleanupSettings(settings) {
  const target = cleanupSettingsPath();
  try {
    const next = normalizeSettings(settings);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, JSON.stringify(next, null, 2), 'utf-8');
    return { ok: true, path: target, settings: next };
  } catch (err) {
    return { ok: false, path: target, error: err.message };
  }
}

async function readJsonArray(target) {
  try {
    const raw = await fs.promises.readFile(target, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeJsonArray(target, rows) {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, JSON.stringify(rows, null, 2), 'utf-8');
}

async function readCleanupLogs() {
  return readJsonArray(cleanupLogsPath());
}

async function writeCleanupLog(entry) {
  const target = cleanupLogsPath();
  const logs = await readCleanupLogs();
  const next = [
    {
      id: entry.id || `cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: entry.time || new Date().toISOString(),
      action: entry.action || 'scan',
      category: entry.category || '',
      filePath: entry.filePath || '',
      fileName: entry.fileName || (entry.filePath ? path.basename(entry.filePath) : ''),
      fileSize: Number(entry.fileSize || 0),
      result: entry.result || 'ok',
      errorMessage: entry.errorMessage || '',
      details: entry.details || null,
    },
    ...logs,
  ].slice(0, LOG_LIMIT);
  await writeJsonArray(target, next);
  return target;
}

async function getIgnoreList() {
  const target = cleanupIgnoreListPath();
  const items = await readJsonArray(target);
  return { ok: true, path: target, items };
}

function normalizeIgnoreItem(input = {}) {
  const type = ['file', 'folder', 'extension', 'keyword'].includes(input.type)
    ? input.type
    : 'file';
  let value = String(input.value || '').trim();
  if (type === 'extension' && value && !value.startsWith('.')) value = `.${value}`;
  return {
    id: input.id || `ignore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    value,
    note: String(input.note || ''),
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

async function addIgnoreItem(input) {
  const target = cleanupIgnoreListPath();
  const item = normalizeIgnoreItem(input);
  if (!item.value) return { ok: false, error: 'Ignore value is required.' };
  const current = await readJsonArray(target);
  const key = `${item.type}:${item.value.toLowerCase()}`;
  const exists = current.some(
    (row) => `${row.type}:${String(row.value || '').toLowerCase()}` === key,
  );
  const next = exists ? current : [item, ...current];
  await writeJsonArray(target, next);
  return { ok: true, path: target, item, items: next };
}

async function removeIgnoreItem(id) {
  const target = cleanupIgnoreListPath();
  const current = await readJsonArray(target);
  const next = current.filter((item) => item.id !== id);
  await writeJsonArray(target, next);
  return { ok: true, path: target, items: next };
}

function normalizeResolved(targetPath) {
  try {
    return path.resolve(targetPath).toLowerCase();
  } catch (_) {
    return '';
  }
}

function protectedRoots() {
  return uniqueStrings([...PROTECTED_ROOTS, appInstallPath(), appUserDataPath()]);
}

function isProtectedPath(targetPath) {
  const resolved = normalizeResolved(targetPath);
  if (!resolved) return true;
  return protectedRoots().some((root) => {
    const base = normalizeResolved(root);
    return base && (resolved === base || resolved.startsWith(`${base}${path.sep}`));
  });
}

function isSystemCoreUserFolder(targetPath) {
  const resolved = normalizeResolved(targetPath);
  const home = normalizeResolved(os.homedir());
  return !!home && resolved === home;
}

function userContentFolders() {
  return uniqueStrings([
    safeAppPath('downloads', 'Downloads'),
    safeAppPath('desktop', 'Desktop'),
    safeAppPath('documents', 'Documents'),
  ]);
}

function isUserContentFolderPath(targetPath) {
  const resolved = normalizeResolved(targetPath);
  return userContentFolders().some((folder) => {
    const base = normalizeResolved(folder);
    return base && (resolved === base || resolved.startsWith(`${base}${path.sep}`));
  });
}

function isInstallerUpdateDriverTemp(targetPath) {
  const lower = String(targetPath || '').toLowerCase();
  const blocked = [
    'softwaredistribution',
    `${path.sep}windows${path.sep}installer`,
    `${path.sep}installer${path.sep}`,
    `${path.sep}driverstore${path.sep}`,
    `${path.sep}drivers${path.sep}`,
    'windows update',
    'windowsupdate',
    'driver',
    'nvidia',
    'amd',
    'intel',
    'setup',
    '.msi',
    '.msp',
  ];
  return blocked.some((token) => lower.includes(String(token).toLowerCase()));
}

function isHiddenOrSystemName(name) {
  return String(name || '').startsWith('.');
}

function ignoreReasonFor(filePath, ignoreItems = []) {
  const resolved = normalizeResolved(filePath);
  const lowerPath = String(filePath || '').toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  for (const raw of ignoreItems || []) {
    const item = normalizeIgnoreItem(raw);
    if (!item.value) continue;
    if (item.type === 'file' && resolved === normalizeResolved(item.value))
      return `ignored file: ${item.value}`;
    if (item.type === 'folder') {
      const folder = normalizeResolved(item.value);
      if (folder && (resolved === folder || resolved.startsWith(`${folder}${path.sep}`)))
        return `ignored folder: ${item.value}`;
    }
    if (item.type === 'extension' && ext === item.value.toLowerCase())
      return `ignored extension: ${item.value}`;
    if (item.type === 'keyword' && lowerPath.includes(item.value.toLowerCase()))
      return `ignored keyword: ${item.value}`;
  }
  return '';
}

async function pathExists(targetPath) {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch (_) {
    return false;
  }
}

function fileId(filePath) {
  return crypto.createHash('sha1').update(filePath).digest('hex');
}

function riskFor(filePath, baseRisk = SAFE) {
  const ext = path.extname(filePath).toLowerCase();
  if (PROTECTED_EXTS.has(ext)) return HIGH;
  return baseRisk;
}

function riskRank(risk) {
  if (risk === PERMANENT) return 4;
  if (risk === HIGH) return 3;
  if (risk === REVIEW) return 2;
  return 1;
}

function fileAgeDays(stat) {
  const modifiedAt = Math.max(Number(stat.mtimeMs || 0), Number(stat.ctimeMs || 0));
  if (!modifiedAt) return 0;
  return Math.max(0, (Date.now() - modifiedAt) / DAY_MS);
}

function categoryImpact(category, risk, stat) {
  const age = fileAgeDays(stat);
  if (category === 'Windows Temp' || category === 'User Temp') {
    if (age < 1)
      return '最近 24 小時內建立或修改，可能仍被安裝、更新、下載或編譯中的程式使用；預設不清理。';
    if (age < 7) return '暫存檔未滿 7 天，通常可以稍後再清理；本次不會預設勾選。';
    return '移到資源回收筒後，多數程式會在需要時重新建立暫存檔。';
  }
  if (category === 'Browser Cache')
    return '瀏覽器快取會重新下載，可能讓下次開啟網站稍慢，但不會刪除書籤或密碼。';
  if (category === 'Thumbnail Cache')
    return 'Windows 會重新產生縮圖，資料夾第一次開啟圖片或影片時可能變慢。';
  if (category === 'Log / Dump') return '刪除後會少掉除錯紀錄；若最近正在追查錯誤，建議保留。';
  if (category === 'Large Files') return '這是使用者檔案或大型素材，清理前請確認內容不再需要。';
  if (category === 'Duplicate Files')
    return '看起來內容重複，但仍可能是專案或備份需要的副本；建議人工確認。';
  if (category === 'Recycle Bin') return '清空資源回收筒後通常無法從原位置還原。';
  if (risk === HIGH) return '此檔案類型可能影響系統、程式設定或資料庫，不建議自動清理。';
  return '將移到資源回收筒，可在清空前還原。';
}

function itemFromStat({
  category,
  type,
  filePath,
  stat,
  action,
  risk = SAFE,
  duplicateGroupId = '',
  selectedDefault,
}) {
  const baseRisk = typeof risk === 'function' ? risk(filePath, stat) : risk;
  const finalRisk = riskFor(filePath, baseRisk);
  const defaultChecked =
    typeof selectedDefault === 'boolean' ? selectedDefault : finalRisk === SAFE;
  return {
    id: fileId(`${category}:${filePath}`),
    category,
    type,
    fileName: path.basename(filePath),
    path: filePath,
    size: stat.size,
    mtime: stat.mtime ? stat.mtime.toISOString() : '',
    action,
    risk: finalRisk,
    riskLevel: finalRisk,
    sourcePath: filePath,
    impact: categoryImpact(category, finalRisk, stat),
    cleanImpact: categoryImpact(category, finalRisk, stat),
    selectedDefault: defaultChecked && finalRisk === SAFE,
    duplicateGroupId,
  };
}

async function scanDirectoryFiles(
  rootPath,
  {
    recursive = true,
    matcher = () => true,
    category = '',
    type = '',
    action = 'Move to Recycle Bin',
    risk = SAFE,
    maxFiles = MAX_SCAN_FILES,
    ignoreItems = [],
    includeHiddenSystem = false,
    selectedDefault,
    defaultSelector,
    allowProtectedRoot = false,
  } = {},
) {
  const items = [];
  const errors = [];
  let skipped = 0;
  const rootResolved = normalizeResolved(rootPath);
  const allowedProtectedChild = (targetPath) => {
    const resolved = normalizeResolved(targetPath);
    return (
      allowProtectedRoot &&
      rootResolved &&
      (resolved === rootResolved || resolved.startsWith(`${rootResolved}${path.sep}`))
    );
  };
  if (
    !rootPath ||
    (!allowedProtectedChild(rootPath) && isProtectedPath(rootPath)) ||
    isSystemCoreUserFolder(rootPath) ||
    !(await pathExists(rootPath))
  ) {
    return { items, errors, skipped };
  }

  const queue = [rootPath];
  while (queue.length && items.length < maxFiles) {
    const current = queue.shift();
    if (
      (!allowedProtectedChild(current) && isProtectedPath(current)) ||
      isSystemCoreUserFolder(current) ||
      ignoreReasonFor(current, ignoreItems)
    ) {
      skipped += 1;
      continue;
    }

    let entries = [];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch (err) {
      errors.push({ path: current, error: err.message });
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (!allowedProtectedChild(full) && isProtectedPath(full)) continue;
      if (!includeHiddenSystem && isHiddenOrSystemName(entry.name)) {
        skipped += 1;
        continue;
      }
      const ignored = ignoreReasonFor(full, ignoreItems);
      if (ignored) {
        skipped += 1;
        continue;
      }
      try {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (recursive) queue.push(full);
          continue;
        }
        if (!entry.isFile()) continue;
        const stat = await fs.promises.stat(full);
        if (!matcher(full, stat)) continue;
        const shouldSelect =
          typeof defaultSelector === 'function' ? !!defaultSelector(full, stat) : selectedDefault;
        items.push(
          itemFromStat({
            category,
            type,
            filePath: full,
            stat,
            action,
            risk,
            selectedDefault: shouldSelect,
          }),
        );
        if (items.length >= maxFiles) break;
      } catch (err) {
        errors.push({ path: full, error: err.message });
      }
    }
  }
  return { items, errors, skipped };
}

function tempPaths() {
  return uniqueStrings([
    process.env.SystemRoot ? path.join(process.env.SystemRoot, 'Temp') : 'C:\\Windows\\Temp',
    process.env.TEMP,
    process.env.TMP,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Temp') : '',
  ]);
}

function tempPathEntries() {
  const systemRoot = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'Temp')
    : 'C:\\Windows\\Temp';
  const entries = [
    { category: 'Windows Temp', dir: systemRoot, allowProtectedRoot: true },
    { category: 'User Temp', dir: process.env.TEMP || '' },
    { category: 'User Temp', dir: process.env.TMP || '' },
    {
      category: 'User Temp',
      dir: process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Temp') : '',
    },
  ];
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry.dir) return false;
    const key = normalizeResolved(entry.dir);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function browserCachePaths() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return [
    {
      label: 'Chrome Cache',
      dir: path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
    },
    {
      label: 'Chrome Code Cache',
      dir: path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Code Cache'),
    },
    {
      label: 'Chrome GPUCache',
      dir: path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'GPUCache'),
    },
    {
      label: 'Edge Cache',
      dir: path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
    },
    {
      label: 'Edge Code Cache',
      dir: path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Code Cache'),
    },
    {
      label: 'Edge GPUCache',
      dir: path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'GPUCache'),
    },
  ];
}

async function scanTempFiles(options = {}) {
  const batches = await Promise.all(
    tempPathEntries().map((entry) =>
      scanDirectoryFiles(entry.dir, {
        recursive: true,
        category: entry.category,
        type: 'Temporary file',
        action: 'Move to Recycle Bin',
        risk: (_filePath, stat) => (fileAgeDays(stat) >= 7 ? SAFE : REVIEW),
        ignoreItems: options.ignoreItems || [],
        allowProtectedRoot: !!entry.allowProtectedRoot,
        selectedDefault: false,
        defaultSelector: (filePath, stat) =>
          fileAgeDays(stat) >= 7 &&
          !isUserContentFolderPath(filePath) &&
          !isInstallerUpdateDriverTemp(filePath),
        matcher: (filePath) =>
          !isUserContentFolderPath(filePath) && !isInstallerUpdateDriverTemp(filePath),
      }),
    ),
  );
  return mergeBatches(batches);
}

async function scanBrowserCache(options = {}) {
  const batches = await Promise.all(
    browserCachePaths().map((entry) =>
      scanDirectoryFiles(entry.dir, {
        recursive: true,
        category: 'Browser Cache',
        type: entry.label,
        action: 'Move to Recycle Bin',
        risk: SAFE,
        ignoreItems: options.ignoreItems || [],
      }),
    ),
  );
  return mergeBatches(batches);
}

async function scanThumbnailCache(options = {}) {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return scanDirectoryFiles(path.join(local, 'Microsoft', 'Windows', 'Explorer'), {
    recursive: false,
    category: 'Thumbnail Cache',
    type: 'Windows thumbnail cache',
    action: 'Move to Recycle Bin after review',
    risk: REVIEW,
    ignoreItems: options.ignoreItems || [],
    selectedDefault: false,
    matcher: (filePath) => /^thumbcache_.*\.db$/i.test(path.basename(filePath)),
  });
}

async function scanLogFiles(settings, options = {}) {
  const roots = uniqueStrings([...tempPaths(), ...(settings.defaultScanFolders || [])]);
  const batches = await Promise.all(
    roots.map((dir) =>
      scanDirectoryFiles(dir, {
        recursive: true,
        category: 'Log / Dump',
        type: 'Log / Dump / Backup',
        action: 'Move to Recycle Bin',
        risk: REVIEW,
        ignoreItems: options.ignoreItems || [],
        selectedDefault: false,
        matcher: (filePath) => LOG_DUMP_EXTS.has(path.extname(filePath).toLowerCase()),
      }),
    ),
  );
  return mergeBatches(batches);
}

async function scanLargeFiles(settings, options = {}) {
  const threshold = Number(settings.largeFileThresholdMb || 100) * 1024 * 1024;
  const batches = await Promise.all(
    (settings.defaultScanFolders || []).map((dir) =>
      scanDirectoryFiles(dir, {
        recursive: true,
        category: 'Large Files',
        type: `Over ${settings.largeFileThresholdMb || 100}MB`,
        action: 'Review manually',
        risk: HIGH,
        ignoreItems: options.ignoreItems || [],
        selectedDefault: false,
        matcher: (_filePath, stat) => stat.size >= threshold,
      }),
    ),
  );
  return mergeBatches(batches);
}

function mergeBatches(batches) {
  const seen = new Set();
  const items = [];
  const errors = [];
  let skipped = 0;
  for (const batch of batches || []) {
    for (const item of batch.items || []) {
      const key = `${item.category}:${normalizeResolved(item.path)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    errors.push(...(batch.errors || []));
    skipped += Number(batch.skipped || 0);
  }
  return { items, errors, skipped };
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function collectFilesForDuplicates(settings, options = {}) {
  const batches = await Promise.all(
    (settings.defaultScanFolders || []).map((dir) =>
      scanDirectoryFiles(dir, {
        recursive: true,
        category: 'Duplicate Files',
        type: 'Duplicate candidate',
        action: 'Review manually',
        risk: REVIEW,
        maxFiles: MAX_DUPLICATE_CANDIDATES,
        ignoreItems: options.ignoreItems || [],
        selectedDefault: false,
        matcher: (_filePath, stat) => stat.size > 0,
      }),
    ),
  );
  return mergeBatches(batches);
}

async function scanDuplicateFiles(settings, options = {}) {
  const collected = await collectFilesForDuplicates(settings, options);
  const bySize = new Map();
  collected.items.forEach((item) => {
    const list = bySize.get(item.size) || [];
    list.push(item);
    bySize.set(item.size, list);
  });

  const hashGroups = new Map();
  const errors = [...collected.errors];
  for (const sameSize of bySize.values()) {
    if (sameSize.length < 2) continue;
    for (const item of sameSize) {
      try {
        const hash = await hashFile(item.path);
        const key = `${item.size}:${hash}`;
        const list = hashGroups.get(key) || [];
        list.push(item);
        hashGroups.set(key, list);
      } catch (err) {
        errors.push({ path: item.path, error: err.message });
      }
    }
  }

  const items = [];
  const groups = [];
  let groupIndex = 1;
  for (const group of hashGroups.values()) {
    if (group.length < 2) continue;
    const duplicateGroupId = `dup-${groupIndex}`;
    groups.push({
      id: duplicateGroupId,
      size: group[0].size,
      count: group.length,
      files: group.map((item) => item.path),
    });
    group.forEach((item) => {
      items.push({ ...item, duplicateGroupId, selectedDefault: false });
    });
    groupIndex += 1;
  }

  return { items, errors, groups, skipped: collected.skipped };
}

async function calculateFolderSize(folderPath, options = {}) {
  const result = await scanDirectoryFiles(folderPath, {
    recursive: true,
    matcher: () => true,
    maxFiles: MAX_SCAN_FILES,
    ignoreItems: options.ignoreItems || [],
  });
  return result.items.reduce((sum, item) => sum + item.size, 0);
}

async function countFilesShallow(folderPath) {
  try {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).length;
  } catch (_) {
    return 0;
  }
}

function execPowerShell(script) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 30000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: stderr || err.message, stdout: stdout || '' });
        return resolve({ ok: true, stdout: stdout || '' });
      },
    );
  });
}

async function getRecycleBinInfo() {
  const script = `
    $ErrorActionPreference = "Stop"
    $shell = New-Object -ComObject Shell.Application
    $bin = $shell.Namespace(0xA)
    $count = 0
    $size = [Int64]0
    foreach ($item in $bin.Items()) {
      $count += 1
      try { $size += [Int64]($item.ExtendedProperty("System.Size")) } catch {}
    }
    [pscustomobject]@{ count = $count; size = $size } | ConvertTo-Json -Compress
  `;
  const res = await execPowerShell(script);
  if (!res.ok) return { ok: false, count: 0, size: 0, error: res.error };
  try {
    const parsed = JSON.parse(res.stdout.trim() || '{}');
    return { ok: true, count: Number(parsed.count || 0), size: Number(parsed.size || 0) };
  } catch (err) {
    return { ok: false, count: 0, size: 0, error: err.message };
  }
}

async function emptyRecycleBin() {
  const before = await getRecycleBinInfo();
  const res = await execPowerShell('Clear-RecycleBin -Force -ErrorAction Stop');
  await writeCleanupLog({
    action: 'clean',
    category: 'Recycle Bin',
    filePath: '$Recycle.Bin',
    fileSize: before.size || 0,
    result: res.ok ? 'success' : 'error',
    errorMessage: res.error || '',
  });
  return {
    ok: res.ok,
    clearedSize: before.size || 0,
    count: before.count || 0,
    error: res.error || '',
  };
}

async function scanStartupItems(settings) {
  const startupDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
    : path.join(
        os.homedir(),
        'AppData',
        'Roaming',
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
        'Startup',
      );
  const disabled = new Set(
    (settings.disabledStartupItems || []).map((item) => normalizeResolved(item)),
  );
  try {
    const entries = await fs.promises.readdir(startupDir, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      const full = path.join(startupDir, entry.name);
      try {
        if (!entry.isFile()) continue;
        const stat = await fs.promises.stat(full);
        items.push({
          name: entry.name,
          path: full,
          isShortcut: path.extname(entry.name).toLowerCase() === '.lnk',
          mtime: stat.mtime ? stat.mtime.toISOString() : '',
          disabledListed: disabled.has(normalizeResolved(full)),
          suggestion: 'Review this startup item if boot feels slow.',
        });
      } catch (_) {
        // skip single item
      }
    }
    return { ok: true, startupDir, items };
  } catch (err) {
    return { ok: false, startupDir, items: [], error: err.message };
  }
}

function summarizeCategories(items, settings, recycleBin, startup) {
  const rows = {};
  for (const item of items) {
    const current = rows[item.category] || {
      count: 0,
      size: 0,
      highRisk: 0,
      risk: SAFE,
      status: 'Scanned',
    };
    current.count += 1;
    current.size += item.size || 0;
    if (item.risk === HIGH || item.risk === PERMANENT) current.highRisk += 1;
    if (riskRank(item.risk) > riskRank(current.risk)) current.risk = item.risk;
    rows[item.category] = current;
  }

  const enabled = {
    'Windows Temp': settings.cleanTemp,
    'User Temp': settings.cleanTemp,
    'Browser Cache': settings.cleanBrowserCache,
    'Thumbnail Cache': settings.cleanThumbnailCache,
    'Log / Dump': settings.scanLogDump,
    'Large Files': settings.scanLargeFiles,
    'Duplicate Files': settings.scanDuplicateFiles,
    'Recycle Bin': true,
    Startup: true,
  };

  for (const key of Object.keys(enabled)) {
    const row = rows[key] || {
      count: 0,
      size: 0,
      highRisk: 0,
      risk: SAFE,
      status: enabled[key] ? 'Scanned' : 'Disabled',
    };
    row.enabled = !!enabled[key];
    rows[key] = row;
  }
  rows['Recycle Bin'] = {
    ...rows['Recycle Bin'],
    count: recycleBin && recycleBin.count ? recycleBin.count : 0,
    size: recycleBin && recycleBin.size ? recycleBin.size : 0,
    risk: recycleBin && recycleBin.count ? PERMANENT : SAFE,
    enabled: true,
    status: 'Scanned',
  };
  rows.Startup = {
    ...rows.Startup,
    count: startup && startup.items ? startup.items.length : 0,
    size: 0,
    risk: startup && startup.items && startup.items.length ? HIGH : SAFE,
    enabled: true,
    status: 'Scanned',
  };
  return rows;
}

async function getDiskUsage(targetPath) {
  const drivePath =
    targetPath || (process.env.SystemDrive ? `${process.env.SystemDrive}\\` : 'C:\\');
  try {
    const stats = await fs.promises.statfs(drivePath);
    const blockSize = stats.bsize;
    const total = stats.blocks * blockSize;
    const free = stats.bavail * blockSize;
    const used = total - free;
    const freePercent = total > 0 ? Math.round((free / total) * 100) : 0;
    const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;
    return { ok: true, drive: drivePath, total, free, used, freePercent, usedPercent };
  } catch (err) {
    return {
      ok: false,
      drive: drivePath,
      total: 0,
      free: 0,
      used: 0,
      freePercent: 0,
      usedPercent: 0,
      error: err.message,
    };
  }
}

function impact(level) {
  return level;
}

function buildRecommendations({
  downloadsCount,
  downloadsSize,
  desktopCount,
  tempSize,
  browserSize,
  largeCount,
  duplicateCount,
  recycleBin,
  startupCount,
  disk,
  settings,
}) {
  const rows = [];
  if (tempSize > 1024 * 1024 * 1024) {
    rows.push({
      id: 'temp-large',
      title: 'Temp 快取過大',
      reason: `目前 Temp 約 ${(tempSize / 1024 / 1024 / 1024).toFixed(1)} GB，可能佔用系統碟空間。`,
      impact: impact('高'),
      action: '掃描並清理安全的暫存檔',
      button: '掃描 Temp',
      target: 'scan-temp',
    });
  }
  if (downloadsCount > 200 || downloadsSize > 5 * 1024 * 1024 * 1024) {
    rows.push({
      id: 'downloads-many',
      title: 'Downloads 檔案過多',
      reason: `目前 Downloads 有 ${downloadsCount} 個檔案，大小約 ${(downloadsSize / 1024 / 1024 / 1024).toFixed(1)} GB。`,
      impact: impact(downloadsCount > 300 ? '高' : '中'),
      action: '使用 Downloads 自動分類功能',
      button: '前往 Downloads 整理',
      target: 'downloads',
    });
  }
  if (desktopCount > 80) {
    rows.push({
      id: 'desktop-many',
      title: 'Desktop 檔案過多',
      reason: `桌面目前有 ${desktopCount} 個檔案，可能影響整理效率。`,
      impact: impact('中'),
      action: '整理桌面或移入專案資料夾',
      button: '查看 Project Hub',
      target: 'projects',
    });
  }
  if (largeCount > 10) {
    rows.push({
      id: 'large-files',
      title: '大檔案過多',
      reason: `找到 ${largeCount} 個超過 ${settings.largeFileThresholdMb}MB 的檔案。`,
      impact: impact('中'),
      action: '檢查是否要移到外接硬碟或備份',
      button: '查看大檔案',
      target: 'large',
    });
  }
  if (duplicateCount > 0) {
    rows.push({
      id: 'duplicates',
      title: '發現重複檔案',
      reason: `找到 ${duplicateCount} 組重複檔案，建議手動確認後清理。`,
      impact: impact(duplicateCount > 10 ? '高' : '中'),
      action: '檢查重複檔案群組',
      button: '查看重複檔案',
      target: 'duplicates',
    });
  }
  if (recycleBin && recycleBin.size > 2 * 1024 * 1024 * 1024) {
    rows.push({
      id: 'recycle-large',
      title: '資源回收筒容量過大',
      reason: `資源回收筒約 ${(recycleBin.size / 1024 / 1024 / 1024).toFixed(1)} GB。`,
      impact: impact('中'),
      action: '確認後清空資源回收筒',
      button: '查看資源回收筒',
      target: 'recycle',
    });
  }
  if (startupCount > 10) {
    rows.push({
      id: 'startup-many',
      title: '啟動項過多',
      reason: `啟動資料夾有 ${startupCount} 個項目，可能影響開機速度。`,
      impact: impact('中'),
      action: '檢查啟動項並加入停用清單',
      button: '查看啟動項',
      target: 'startup',
    });
  }
  const lowBytes = Number(settings.lowDiskThresholdGb || 20) * 1024 * 1024 * 1024;
  if (
    disk &&
    disk.ok &&
    (disk.free < lowBytes || disk.usedPercent >= Number(settings.lowDiskUsagePercent || 90))
  ) {
    rows.push({
      id: 'disk-low',
      title: 'C 槽空間不足',
      reason: `C 槽剩餘約 ${(disk.free / 1024 / 1024 / 1024).toFixed(1)} GB，使用率 ${disk.usedPercent}%。`,
      impact: impact('高'),
      action: '執行清理優化並檢查大檔案',
      button: '前往清理優化',
      target: 'cleanup',
    });
  }
  if (!rows.length) {
    rows.push({
      id: 'all-good',
      title: '目前沒有明顯清理壓力',
      reason: '掃描結果沒有顯示大量暫存、重複檔案或低磁碟空間。',
      impact: impact('低'),
      action: '維持定期掃描',
      button: '重新掃描',
      target: 'scan',
    });
  }
  return rows;
}

async function buildOptimization(
  items,
  duplicateGroups,
  settings,
  recycleBin,
  startup,
  ignoreItems,
) {
  const tempSize = items
    .filter((item) => item.category === 'Windows Temp' || item.category === 'User Temp')
    .reduce((sum, item) => sum + item.size, 0);
  const browserSize = items
    .filter((item) => item.category === 'Browser Cache')
    .reduce((sum, item) => sum + item.size, 0);
  const downloads = safeAppPath('downloads', 'Downloads');
  const desktop = safeAppPath('desktop', 'Desktop');
  const downloadsSize = await calculateFolderSize(downloads, { ignoreItems });
  const downloadsCount = await countFilesShallow(downloads);
  const desktopCount = await countFilesShallow(desktop);
  const disk = await getDiskUsage('C:\\');
  const largeCount = items.filter((item) => item.category === 'Large Files').length;
  const duplicateCount = duplicateGroups ? duplicateGroups.length : 0;
  const startupCount = startup.items ? startup.items.length : 0;
  const recommendations = buildRecommendations({
    downloadsCount,
    downloadsSize,
    desktopCount,
    tempSize,
    browserSize,
    largeCount,
    duplicateCount,
    recycleBin,
    startupCount,
    disk,
    settings,
  });
  return {
    startupCount,
    downloadsSize,
    downloadsCount,
    desktopFileCount: desktopCount,
    tempSize,
    browserCacheSize: browserSize,
    largeFileCount: largeCount,
    duplicateFileCount: duplicateCount,
    recommendations,
    suggestions: recommendations.map((row) => row.title),
    disk,
  };
}

async function scan(options = {}) {
  const startedAt = new Date();
  const loaded = await loadCleanupSettings();
  const settings = normalizeSettings({ ...(loaded.settings || {}), ...(options.settings || {}) });
  const ignore = await getIgnoreList();
  const ignoreItems = ignore.items || [];
  const errors = [];
  const batches = [];

  if (settings.cleanTemp) batches.push(await scanTempFiles({ ignoreItems }));
  if (settings.cleanBrowserCache) batches.push(await scanBrowserCache({ ignoreItems }));
  if (settings.cleanThumbnailCache) batches.push(await scanThumbnailCache({ ignoreItems }));
  if (settings.scanLogDump) batches.push(await scanLogFiles(settings, { ignoreItems }));
  let large = { items: [], errors: [], skipped: 0 };
  if (settings.scanLargeFiles) {
    large = await scanLargeFiles(settings, { ignoreItems });
    batches.push(large);
  }
  let duplicates = { items: [], errors: [], groups: [], skipped: 0 };
  if (settings.scanDuplicateFiles) {
    duplicates = await scanDuplicateFiles(settings, { ignoreItems });
    batches.push(duplicates);
  }

  const merged = mergeBatches(batches);
  errors.push(...merged.errors);
  let items = merged.items;
  if (!settings.showHighRiskFiles) items = items.filter((item) => item.risk !== HIGH);
  const recycleBin = await getRecycleBinInfo();
  const startup = await scanStartupItems(settings);
  const logs = await readCleanupLogs();
  const optimization = await buildOptimization(
    items,
    duplicates.groups || [],
    settings,
    recycleBin,
    startup,
    ignoreItems,
  );
  const categories = summarizeCategories(items, settings, recycleBin, startup);
  const finishedAt = new Date();

  await writeCleanupLog({
    action: 'scan',
    category: 'Clean Center',
    result: 'success',
    details: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      totalCount: items.length,
      totalSize: items.reduce((sum, item) => sum + item.size, 0),
    },
  });

  return {
    ok: true,
    settings,
    ignoreList: ignoreItems,
    items,
    categories,
    duplicateGroups: duplicates.groups || [],
    recycleBin,
    startup,
    logs,
    errors,
    skippedCount: merged.skipped || 0,
    summary: {
      totalCount: items.length,
      totalSize: items.reduce((sum, item) => sum + item.size, 0),
      highRiskCount: items.filter((item) => item.risk === HIGH || item.risk === PERMANENT).length,
      safeCount: items.filter((item) => item.risk === SAFE).length,
      selectedDefaultSize: items
        .filter((item) => item.selectedDefault)
        .reduce((sum, item) => sum + item.size, 0),
      lastScanTime: finishedAt.toISOString(),
      lastCleanupTime:
        (logs.find((log) => log.action === 'clean' && log.result === 'success') || {}).time || '',
    },
    optimization,
  };
}

function cleanupFailureReason(err) {
  const code = String((err && err.code) || '').toUpperCase();
  const message = String((err && err.message) || '未知錯誤');
  if (code === 'ENOENT') return '路徑不存在';
  if (code === 'EBUSY') return '檔案正在使用';
  if (code === 'EPERM' || code === 'EACCES') return '權限不足或檔案被系統保護';
  if (/protected path/i.test(message)) return '受保護路徑，已拒絕清理';
  if (/only files/i.test(message)) return '不是可清理檔案';
  if (/recycle bin/i.test(message)) return '目前執行環境無法移到資源回收筒';
  return message;
}

function shouldTreatAsSkipped(err) {
  const code = String((err && err.code) || '').toUpperCase();
  const message = String((err && err.message) || '');
  return (
    ['ENOENT', 'EBUSY', 'EPERM', 'EACCES'].includes(code) ||
    /protected path|only files|recycle bin/i.test(message)
  );
}

async function cleanSelectedFiles(items = [], options = {}) {
  const startedAt = new Date();
  const loaded = await loadCleanupSettings();
  const settings = normalizeSettings({ ...(loaded.settings || {}), ...(options.settings || {}) });
  const selected = Array.isArray(items) ? items : [];
  const results = [];
  let cleaned = 0;
  let failed = 0;
  let skipped = 0;
  let freedSize = 0;
  let highRiskProcessed = 0;

  for (const item of selected) {
    const filePath = item.path;
    let stat = null;
    try {
      if (!filePath || isProtectedPath(filePath) || isSystemCoreUserFolder(filePath)) {
        throw new Error('Protected path; cleanup refused.');
      }
      stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        throw new Error('Only files can be cleaned.');
      }
      if (item.risk === HIGH) highRiskProcessed += 1;
      await moveToRecycleBin(filePath);
      cleaned += 1;
      freedSize += stat.size;
      results.push({
        path: filePath,
        fileName: path.basename(filePath),
        size: stat.size,
        category: item.category || '',
        status: 'cleaned',
      });
      await writeCleanupLog({
        action: 'clean',
        category: item.category || '',
        filePath,
        fileSize: stat.size,
        result: 'success',
      });
    } catch (err) {
      const status = shouldTreatAsSkipped(err) ? 'skipped' : 'error';
      const reason = cleanupFailureReason(err);
      if (status === 'skipped') skipped += 1;
      else failed += 1;
      results.push({
        path: filePath || '',
        fileName: item.fileName || (filePath ? path.basename(filePath) : ''),
        size: stat ? stat.size : Number(item.size || 0),
        category: item.category || '',
        status,
        reason,
        error: err.message,
      });
      await writeCleanupLog({
        action: 'clean',
        category: item.category || '',
        filePath: filePath || '',
        fileSize: stat ? stat.size : Number(item.size || 0),
        result: status,
        errorMessage: reason,
      });
    }
  }

  const finishedAt = new Date();
  const report = {
    successCount: cleaned,
    failureCount: failed,
    skippedCount: skipped,
    freedSize,
    highRiskProcessed,
    failureReasons: results
      .filter((row) => row.status === 'error' || row.status === 'skipped')
      .map((row) => ({
        fileName: row.fileName || path.basename(row.path || ''),
        path: row.path || '',
        category: row.category || '',
        status: row.status,
        reason: row.reason || row.error || '未知原因',
      })),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };

  await writeCleanupLog({
    action: 'clean-summary',
    category: 'Clean Center',
    fileSize: freedSize,
    result: failed ? 'partial' : 'success',
    details: report,
  });

  return {
    ok: failed === 0,
    cleaned,
    failed,
    skipped,
    freedSize,
    usedRecycleBin: settings.useRecycleBin !== false,
    results,
    report,
    logsPath: cleanupLogsPath(),
  };
}

async function getRecommendations(options = {}) {
  const loaded = await loadCleanupSettings();
  const settings = normalizeSettings({ ...(loaded.settings || {}), ...(options.settings || {}) });
  if (options.scanResult && options.scanResult.optimization) {
    return { ok: true, recommendations: options.scanResult.optimization.recommendations || [] };
  }
  const quick = await scan({ settings: { ...settings, scanDuplicateFiles: false } });
  return { ok: true, recommendations: quick.optimization.recommendations || [] };
}

async function getStatus() {
  const loaded = await loadCleanupSettings();
  const settings = loaded.settings || defaultSettings();
  const logs = await readCleanupLogs();
  const lastScan = logs.find(
    (log) => log.action === 'scan' && (log.result === 'success' || log.result === 'ok'),
  );
  const lastClean = logs.find(
    (log) => log.action === 'clean-summary' || (log.action === 'clean' && log.result === 'success'),
  );
  const ignore = await getIgnoreList();
  const tempSize = (
    await Promise.all(
      tempPaths().map((dir) =>
        calculateFolderSize(dir, { ignoreItems: ignore.items || [] }).catch(() => 0),
      ),
    )
  ).reduce((sum, size) => sum + size, 0);
  const disk = await getDiskUsage('C:\\');
  const recycleBin = await getRecycleBinInfo();
  const recommendations = buildRecommendations({
    downloadsCount: await countFilesShallow(safeAppPath('downloads', 'Downloads')),
    downloadsSize: 0,
    desktopCount: await countFilesShallow(safeAppPath('desktop', 'Desktop')),
    tempSize,
    browserSize: 0,
    largeCount: 0,
    duplicateCount: 0,
    recycleBin,
    startupCount: 0,
    disk,
    settings,
  });
  return {
    ok: true,
    lastScanTime: lastScan ? lastScan.time : '',
    lastCleanupTime: lastClean ? lastClean.time : '',
    lastFreedSize: lastClean
      ? Number(lastClean.fileSize || (lastClean.details && lastClean.details.freedSize) || 0)
      : 0,
    tempSize,
    recycleBin,
    disk,
    hasRecommendations: recommendations.some((row) => row.id !== 'all-good'),
    recommendations,
  };
}

async function exportLogs(format = 'json') {
  const logs = await readCleanupLogs();
  const ext = format === 'txt' ? 'txt' : 'json';
  const target = path.join(appUserDataPath(), `cleanupLogs-export-${Date.now()}.${ext}`);
  if (ext === 'txt') {
    const lines = logs.map((log) =>
      [
        log.time,
        log.action,
        log.category,
        log.fileName || path.basename(log.filePath || ''),
        log.filePath,
        log.fileSize,
        log.result,
        log.errorMessage || '',
      ].join('\t'),
    );
    await fs.promises.writeFile(target, lines.join(os.EOL), 'utf-8');
  } else {
    await fs.promises.writeFile(target, JSON.stringify(logs, null, 2), 'utf-8');
  }
  return { ok: true, path: target };
}

async function clearLogs() {
  await writeJsonArray(cleanupLogsPath(), []);
  return { ok: true, path: cleanupLogsPath(), logs: [] };
}

async function runAutomationAction(type, options = {}) {
  const loaded = await loadCleanupSettings();
  const settings = normalizeSettings({ ...(loaded.settings || {}), ...(options.settings || {}) });
  const ignore = await getIgnoreList();
  switch (type) {
    case 'scanTemp':
      return { ok: true, ...(await scanTempFiles({ ignoreItems: ignore.items || [] })) };
    case 'scanCache':
      return { ok: true, ...(await scanBrowserCache({ ignoreItems: ignore.items || [] })) };
    case 'scanLargeFiles':
      return { ok: true, ...(await scanLargeFiles(settings, { ignoreItems: ignore.items || [] })) };
    case 'scanDuplicateFiles':
      return {
        ok: true,
        ...(await scanDuplicateFiles(settings, { ignoreItems: ignore.items || [] })),
      };
    case 'checkTempSize': {
      const size = (
        await Promise.all(
          tempPaths().map((dir) =>
            calculateFolderSize(dir, { ignoreItems: ignore.items || [] }).catch(() => 0),
          ),
        )
      ).reduce((sum, value) => sum + value, 0);
      return {
        ok: true,
        size,
        exceeded: size >= Number(options.thresholdBytes || 1024 * 1024 * 1024),
      };
    }
    case 'checkRecycleBinSize': {
      const bin = await getRecycleBinInfo();
      return {
        ok: bin.ok,
        ...bin,
        exceeded: (bin.size || 0) >= Number(options.thresholdBytes || 2 * 1024 * 1024 * 1024),
      };
    }
    case 'checkDownloadsCount': {
      const count = await countFilesShallow(safeAppPath('downloads', 'Downloads'));
      return { ok: true, count, exceeded: count >= Number(options.thresholdCount || 200) };
    }
    default:
      return { ok: false, error: 'Unsupported cleanup automation action.' };
  }
}

module.exports = {
  SAFE,
  REVIEW,
  HIGH,
  PERMANENT,
  cleanupSettingsPath,
  cleanupLogsPath,
  cleanupIgnoreListPath,
  defaultSettings,
  normalizeSettings,
  loadCleanupSettings,
  saveCleanupSettings,
  readCleanupLogs,
  writeCleanupLog,
  getIgnoreList,
  addIgnoreItem,
  removeIgnoreItem,
  scanTempFiles,
  scanBrowserCache,
  scanThumbnailCache,
  scanLogFiles,
  scanLargeFiles,
  scanDuplicateFiles,
  calculateFolderSize,
  cleanSelectedFiles,
  moveToRecycleBin,
  getRecycleBinInfo,
  emptyRecycleBin,
  scanStartupItems,
  getDiskUsage,
  getRecommendations,
  getStatus,
  exportLogs,
  clearLogs,
  runAutomationAction,
  scan,
};
