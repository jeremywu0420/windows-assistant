'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { app } = require('electron');
const {
  CATEGORY_RULES,
  getCategoryRule,
  getDocumentSubRule,
  isTopLevelCategoryFolderName,
  isDocumentSubcategoryFolderName,
} = require('./organizerRules');
const { categoryForExt, classifyFile, isHiddenLikeName } = require('./fileClassifier');

const DEFAULT_DOWNLOAD_SETTINGS = {
  folderPath: '',
  includeSubfolders: false,
  skipCategoryFolders: true,
  mode: 'move',
  conflictStrategy: 'rename',
  showFullPaths: false,
  subdivideDocuments: true,
  includeHiddenFiles: false,
};

let cachedDetected = null;

function userDataPath(fileName) {
  try {
    if (app && app.isReady()) return path.join(app.getPath('userData'), fileName);
  } catch (_) {
    /* fall through */
  }
  return path.join(os.tmpdir(), 'pc-life-assistant', fileName);
}

function settingsPath() {
  return userDataPath('downloads-settings.json');
}

function historyPath() {
  return userDataPath('downloads-organize-history.json');
}

function expandEnv(value) {
  return String(value || '').replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
}

function queryRegistryDownloads() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders';
    const guid = '{374DE290-123F-4565-9164-39C4925E467B}';
    execFile(
      'reg',
      ['query', key, '/v', guid],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const match = stdout.match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m);
        resolve(match ? expandEnv(match[1].trim()) : null);
      },
    );
  });
}

async function pathIsDirectory(target) {
  try {
    const stat = await fs.promises.stat(target);
    return stat.isDirectory();
  } catch (_) {
    return false;
  }
}

function pathIsDirectorySync(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch (_) {
    return false;
  }
}

async function detectDownloads() {
  const candidates = [];
  const reg = await queryRegistryDownloads();
  if (reg) candidates.push(reg);
  for (const envName of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial', 'USERPROFILE']) {
    if (process.env[envName]) candidates.push(path.join(process.env[envName], 'Downloads'));
  }
  try {
    if (app && app.isReady()) candidates.push(app.getPath('downloads'));
  } catch (_) {
    /* ignore */
  }
  candidates.push(path.join(os.homedir(), 'Downloads'));

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (await pathIsDirectory(candidate)) {
      cachedDetected = candidate;
      return { ok: true, path: candidate, candidates: Array.from(seen) };
    }
  }
  return {
    ok: false,
    path: path.join(os.homedir(), 'Downloads'),
    error: 'Could not detect Downloads folder.',
    candidates: Array.from(seen),
  };
}

async function getDefaultPath() {
  if (cachedDetected && (await pathIsDirectory(cachedDetected)))
    return { ok: true, path: cachedDetected };
  return detectDownloads();
}

function normalizeSettings(input = {}) {
  return {
    ...DEFAULT_DOWNLOAD_SETTINGS,
    ...input,
    includeSubfolders: !!input.includeSubfolders,
    skipCategoryFolders: input.skipCategoryFolders !== false,
    mode: input.mode === 'copy' ? 'copy' : 'move',
    conflictStrategy: 'rename',
    showFullPaths: !!input.showFullPaths,
    subdivideDocuments: input.subdivideDocuments !== false,
    includeHiddenFiles: !!input.includeHiddenFiles,
  };
}

async function getSettings() {
  const target = settingsPath();
  try {
    const raw = await fs.promises.readFile(target, 'utf-8');
    return { ok: true, path: target, settings: normalizeSettings(JSON.parse(raw)) };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return {
        ok: false,
        path: target,
        settings: { ...DEFAULT_DOWNLOAD_SETTINGS },
        error: err.message,
      };
    }
    const detected = await getDefaultPath();
    const settings = normalizeSettings({
      ...DEFAULT_DOWNLOAD_SETTINGS,
      folderPath: detected.path || '',
    });
    await saveSettings(settings);
    return { ok: true, path: target, settings };
  }
}

async function saveSettings(settings) {
  const target = settingsPath();
  try {
    const next = normalizeSettings(settings);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, JSON.stringify(next, null, 2), 'utf-8');
    return { ok: true, path: target, settings: next };
  } catch (err) {
    return { ok: false, path: target, error: err.message };
  }
}

async function resolveDownloadsPath(override) {
  if (override && String(override).trim()) return override;
  const settings = await getSettings();
  if (settings.ok && settings.settings.folderPath) return settings.settings.folderPath;
  const detected = await getDefaultPath();
  return detected.path || path.join(os.homedir(), 'Downloads');
}

function categoryRule(category) {
  const parts = String(category || '').split(/[\\/]/);
  if (parts[0] === 'Documents' && parts[1]) {
    const subRule = getDocumentSubRule(parts[1]);
    return {
      category,
      label: `Documents/${subRule.label}`,
      exts: subRule.exts,
    };
  }
  return getCategoryRule(parts[0]);
}

function isCategoryFolderName(name) {
  return isTopLevelCategoryFolderName(name);
}

function relativeParts(rootPath, filePath) {
  const rel = path.relative(rootPath, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return [];
  return rel.split(/[\\/]+/).filter(Boolean);
}

function isInsideFinalTarget(rootPath, filePath, classification) {
  const parts = relativeParts(rootPath, filePath);
  if (parts.length <= classification.targetSegments.length) return false;
  return classification.targetSegments.every((segment, idx) => {
    return String(parts[idx] || '').toLowerCase() === String(segment).toLowerCase();
  });
}

function skipReasonForCategoryFolder(rootPath, filePath, classification, settings) {
  if (!settings.skipCategoryFolders) return '';
  const parts = relativeParts(rootPath, filePath);
  if (parts.length < 2 || !isCategoryFolderName(parts[0])) return '';

  if (isInsideFinalTarget(rootPath, filePath, classification)) {
    return 'Already in the correct category folder';
  }

  if (parts[0].toLowerCase() === 'documents' && settings.subdivideDocuments !== false) {
    const second = parts[1] || '';
    if (!isDocumentSubcategoryFolderName(second)) return '';
    return 'Already inside a Documents subcategory folder';
  }

  return 'Already in a category folder';
}

async function readDirSafe(dir) {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    return null;
  }
}

async function walkFiles(rootPath, settings, errors, current = rootPath, depth = 0) {
  const entries = await readDirSafe(current);
  if (!entries) {
    errors.push({ path: current, status: 'error', error: 'Cannot read folder.' });
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    try {
      if (!settings.includeHiddenFiles && isHiddenLikeName(entry.name)) continue;
      if (entry.isDirectory()) {
        if (!settings.includeSubfolders) continue;
        if (settings.skipCategoryFolders && isCategoryFolderName(entry.name)) {
          if (settings.subdivideDocuments !== false && entry.name.toLowerCase() === 'documents') {
            files.push(...(await walkFiles(rootPath, settings, errors, full, depth + 1)));
          }
          continue;
        }
        const relParts = relativeParts(rootPath, full);
        if (
          settings.skipCategoryFolders &&
          relParts[0] &&
          relParts[0].toLowerCase() === 'documents' &&
          isDocumentSubcategoryFolderName(entry.name)
        ) {
          continue;
        }
        files.push(...(await walkFiles(rootPath, settings, errors, full, depth + 1)));
      } else if (entry.isFile()) {
        files.push(full);
      }
    } catch (err) {
      errors.push({ path: full, status: 'error', error: err.message });
    }
  }
  return files;
}

function resolveCollision(destDir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(destDir, fileName);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(destDir, `${base} (${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}

function relativeOrFull(rootPath, filePath, showFullPaths) {
  return showFullPaths ? filePath : path.relative(rootPath, filePath) || path.basename(filePath);
}

async function scan(folderPath, scanOptions = {}) {
  const saved = await getSettings();
  const settings = normalizeSettings({ ...(saved.settings || {}), ...scanOptions });
  const rootPath = folderPath || settings.folderPath || (await resolveDownloadsPath());
  const result = {
    ok: true,
    downloadsPath: rootPath,
    settings,
    items: [],
    skippedItems: [],
    errors: [],
    byCategory: {},
    categories: [],
    totalFiles: 0,
    organizableFiles: 0,
    skippedFiles: 0,
    errorFiles: 0,
  };

  if (!(await pathIsDirectory(rootPath))) {
    return { ...result, ok: false, error: `Folder not found: ${rootPath}` };
  }

  const files = await walkFiles(rootPath, settings, result.errors);
  result.totalFiles = files.length;

  for (const sourcePath of files) {
    try {
      const classification = classifyFile(path.basename(sourcePath), settings);
      const skipReason = skipReasonForCategoryFolder(
        rootPath,
        sourcePath,
        classification,
        settings,
      );
      if (skipReason) {
        result.skippedItems.push({
          name: path.basename(sourcePath),
          sourcePath,
          displaySource: relativeOrFull(rootPath, sourcePath, settings.showFullPaths),
          status: 'skipped',
          reason: skipReason,
        });
        continue;
      }

      const targetDir = path.join(rootPath, ...classification.targetSegments);
      const targetPath = resolveCollision(targetDir, path.basename(sourcePath));
      result.items.push({
        id: `${sourcePath}|${classification.categoryPath}`,
        name: path.basename(sourcePath),
        ext: classification.ext,
        type: classification.categoryPath,
        category: classification.category,
        subcategory: classification.subcategory,
        categoryPath: classification.categoryPath,
        rootPath,
        sourcePath,
        targetDir,
        targetPath,
        displaySource: relativeOrFull(rootPath, sourcePath, settings.showFullPaths),
        displayTarget: relativeOrFull(rootPath, targetPath, settings.showFullPaths),
        displayTargetDir: relativeOrFull(rootPath, targetDir, settings.showFullPaths),
        status: 'ready',
      });
      result.byCategory[classification.categoryPath] =
        (result.byCategory[classification.categoryPath] || 0) + 1;
    } catch (err) {
      result.errors.push({
        path: sourcePath,
        name: path.basename(sourcePath),
        status: 'error',
        error: err.message,
      });
    }
  }

  result.organizableFiles = result.items.length;
  result.skippedFiles = result.skippedItems.length;
  result.errorFiles = result.errors.length;
  result.categories = Object.keys(result.byCategory)
    .sort((a, b) => result.byCategory[b] - result.byCategory[a] || a.localeCompare(b))
    .map((category) => {
      const rule = categoryRule(category);
      return {
        category,
        label: rule.label,
        count: result.byCategory[category],
        targetDir: path.join(rootPath, ...category.split('/')),
        examples: rule.exts.length
          ? rule.exts.slice(0, 8)
          : category === 'No Extension'
            ? ['(none)']
            : ['unmatched'],
      };
    });

  return result;
}

async function copyOrMove(sourcePath, destPath, mode) {
  if (mode === 'copy') {
    await fs.promises.copyFile(sourcePath, destPath);
    return;
  }
  try {
    await fs.promises.rename(sourcePath, destPath);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(sourcePath, destPath);
    await fs.promises.unlink(sourcePath);
  }
}

async function readHistoryFile() {
  const target = historyPath();
  try {
    const raw = await fs.promises.readFile(target, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    return [];
  }
}

async function writeHistoryFile(history) {
  const target = historyPath();
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, JSON.stringify(history.slice(0, 30), null, 2), 'utf-8');
  return target;
}

async function getHistory() {
  const history = await readHistoryFile();
  return { ok: true, path: historyPath(), history, last: history[0] || null };
}

async function organize(items, options = {}) {
  const saved = await getSettings();
  const settings = normalizeSettings({ ...(saved.settings || {}), ...options });
  const selected = Array.isArray(items) ? items : [];
  const organizedAt = new Date().toISOString();
  const results = [];
  const historyEntries = [];
  const byCategory = {};
  const failedFiles = [];
  let moved = 0;
  let copied = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of selected) {
    try {
      if (!item || !item.sourcePath || !item.targetDir) throw new Error('Invalid organize item.');
      const stat = await fs.promises.stat(item.sourcePath);
      if (!stat.isFile()) throw new Error('Source is not a file.');

      const sourceDir = path.resolve(path.dirname(item.sourcePath)).toLowerCase();
      const targetDirResolved = path.resolve(item.targetDir).toLowerCase();
      if (sourceDir === targetDirResolved) {
        skipped += 1;
        results.push({
          name: item.name || path.basename(item.sourcePath),
          from: item.sourcePath,
          to: item.sourcePath,
          category: item.categoryPath || item.category || '',
          status: 'skipped',
          message: 'Already in target folder.',
        });
        continue;
      }

      await fs.promises.mkdir(item.targetDir, { recursive: true });
      const dest = resolveCollision(item.targetDir, path.basename(item.sourcePath));
      await copyOrMove(item.sourcePath, dest, settings.mode);

      if (settings.mode === 'copy') copied += 1;
      else moved += 1;

      const category = item.categoryPath || item.category || '';
      byCategory[category] = (byCategory[category] || 0) + 1;
      const record = {
        fileName: path.basename(item.sourcePath),
        category,
        originalPath: item.sourcePath,
        newPath: dest,
        mode: settings.mode,
        organizedAt,
        movedAt: organizedAt,
      };
      historyEntries.push(record);
      results.push({
        name: record.fileName,
        from: record.originalPath,
        to: record.newPath,
        category: record.category,
        mode: settings.mode,
        status: settings.mode === 'copy' ? 'copied' : 'moved',
      });
    } catch (err) {
      failed += 1;
      results.push({
        name: item ? item.name || path.basename(item.sourcePath || '') : '(unknown)',
        from: item ? item.sourcePath || '' : '',
        to: '',
        category: item ? item.category || '' : '',
        status: 'error',
        error: err.message,
      });
      failedFiles.push({
        name: item ? item.name || path.basename(item.sourcePath || '') : '(unknown)',
        path: item ? item.sourcePath || '' : '',
        error: err.message,
      });
    }
  }

  let historyFile = historyPath();
  let historyError = null;
  if (historyEntries.length) {
    try {
      const history = await readHistoryFile();
      history.unshift({
        id: `organize-${Date.now()}`,
        organizedAt,
        rootPath: selected[0] ? selected[0].rootPath || path.dirname(selected[0].targetDir) : '',
        mode: settings.mode,
        entries: historyEntries,
        summary: { moved, copied, skipped, failed, total: selected.length, byCategory },
      });
      historyFile = await writeHistoryFile(history);
    } catch (err) {
      historyError = err.message;
    }
  }

  return {
    ok: failed === 0 && !historyError,
    moved,
    copied,
    skipped,
    failed,
    total: selected.length,
    summary: { moved, copied, skipped, failed, total: selected.length, byCategory, failedFiles },
    results,
    historyFile,
    historyError,
  };
}

async function restoreLast() {
  const history = await readHistoryFile();
  const batch = history[0];
  if (!batch || !Array.isArray(batch.entries) || batch.entries.length === 0) {
    return {
      ok: false,
      restored: 0,
      failed: 0,
      results: [],
      error: 'No organize history to restore.',
    };
  }

  const results = [];
  let restored = 0;
  let failed = 0;

  for (const entry of batch.entries) {
    try {
      if (entry.mode === 'copy') {
        results.push({
          name: entry.fileName,
          from: entry.newPath,
          to: entry.originalPath,
          status: 'skipped',
          message: 'Copy-mode history does not need restore.',
        });
        continue;
      }
      const stat = await fs.promises.stat(entry.newPath);
      if (!stat.isFile()) throw new Error('Organized file no longer exists.');
      await fs.promises.mkdir(path.dirname(entry.originalPath), { recursive: true });
      const dest = resolveCollision(
        path.dirname(entry.originalPath),
        path.basename(entry.originalPath),
      );
      await copyOrMove(entry.newPath, dest, 'move');
      restored += 1;
      results.push({ name: entry.fileName, from: entry.newPath, to: dest, status: 'restored' });
    } catch (err) {
      failed += 1;
      results.push({
        name: entry.fileName,
        from: entry.newPath,
        to: entry.originalPath,
        status: 'error',
        error: err.message,
      });
    }
  }

  if (failed === 0) {
    history.shift();
    await writeHistoryFile(history);
  }

  return { ok: failed === 0, restored, failed, results, historyFile: historyPath() };
}

function countUnsorted(override) {
  const downloadsPath =
    override && String(override).trim()
      ? override
      : cachedDetected || path.join(os.homedir(), 'Downloads');
  try {
    const entries = fs.readdirSync(downloadsPath, { withFileTypes: true });
    return {
      ok: true,
      downloadsPath,
      count: entries.filter((entry) => entry.isFile()).length,
    };
  } catch (err) {
    return { ok: false, downloadsPath, count: 0, error: err.message };
  }
}

module.exports = {
  CATEGORY_RULES,
  DEFAULT_DOWNLOAD_SETTINGS,
  settingsPath,
  historyPath,
  getDefaultPath,
  detectDownloads,
  resolveDownloadsPath,
  getSettings,
  saveSettings,
  categoryForExt,
  scan,
  organize,
  restoreLast,
  getHistory,
  countUnsorted,
  resolveCollision,
};
