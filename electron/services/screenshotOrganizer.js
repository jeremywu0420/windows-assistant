'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CATEGORIES,
  DEFAULT_KEYWORDS,
  classifyScreenshot,
  getKeywordMap,
  isCategoryFolderName,
  isDateFolderName,
  isHiddenLikeName,
  isScreenshotImageExt,
  normalizeScreenshotOrganizerSettings,
} = require('./screenshotRules');
const { getScreenshotDate } = require('./screenshotDateHelper');
const { getUniquePath, moveFile, relativeOrFull } = require('./fileMoveHelper');
const { writeOrganizerLog, screenshotLogPath } = require('./organizerLog');

function getScreenshotsPath(config) {
  const general = (config && config.general) || {};
  const screenshots = (config && config.screenshots) || {};
  const override = screenshots.path || general.screenshotsPath;
  if (override && override.trim()) return override;
  return path.join(os.homedir(), 'Pictures', 'Screenshots');
}

function getSettings(config, overrides = {}) {
  const screenshots = (config && config.screenshots) || {};
  return normalizeScreenshotOrganizerSettings({
    ...(screenshots.organizer || {}),
    ...overrides,
  });
}

function targetSegmentsFor(dateFolder, category, settings) {
  const segments = [];
  if (settings.organizeByDate) segments.push(dateFolder);
  if (settings.categoryUnderDate) segments.push(category);
  return segments;
}

function buildScreenshotTargetPath(basePath, dateFolder, category, fileName, settings) {
  return path.join(basePath, ...targetSegmentsFor(dateFolder, category, settings), fileName);
}

function relativeParts(rootPath, filePath) {
  const rel = path.relative(rootPath, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return [];
  return rel.split(/[\\/]+/).filter(Boolean);
}

function isAlreadyOrganized(rootPath, filePath, dateFolder, category, settings) {
  const parts = relativeParts(rootPath, filePath);
  if (parts.length < 2) return false;

  if (settings.organizeByDate && settings.categoryUnderDate) {
    return (
      parts.length >= 3 &&
      parts[0] === dateFolder &&
      parts[1].toLowerCase() === category.toLowerCase()
    );
  }

  if (settings.organizeByDate) {
    return parts.length >= 2 && parts[0] === dateFolder;
  }

  if (settings.categoryUnderDate) {
    return parts.length >= 2 && parts[0].toLowerCase() === category.toLowerCase();
  }

  return false;
}

function shouldSkipDirectory(rootPath, dirPath, entryName, settings) {
  if (!settings.includeHiddenFiles && isHiddenLikeName(entryName)) return true;
  if (!settings.skipAlreadyOrganized) return false;

  const parts = relativeParts(rootPath, dirPath);
  if (parts.length === 1 && (isDateFolderName(entryName) || isCategoryFolderName(entryName)))
    return true;
  if (parts.length >= 2 && isDateFolderName(parts[0]) && isCategoryFolderName(entryName))
    return true;
  return false;
}

async function readDirSafe(dir) {
  try {
    return { ok: true, entries: await fs.promises.readdir(dir, { withFileTypes: true }) };
  } catch (err) {
    return { ok: false, error: err.message, entries: [] };
  }
}

async function collectImageFiles(rootPath, settings, errors, current = rootPath) {
  const read = await readDirSafe(current);
  if (!read.ok) {
    errors.push({ path: current, error: read.error });
    return [];
  }

  const files = [];
  for (const entry of read.entries) {
    const full = path.join(current, entry.name);
    try {
      if (!settings.includeHiddenFiles && isHiddenLikeName(entry.name)) continue;

      if (entry.isDirectory()) {
        if (!settings.includeSubfolders) continue;
        if (shouldSkipDirectory(rootPath, full, entry.name, settings)) continue;
        files.push(...(await collectImageFiles(rootPath, settings, errors, full)));
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!isScreenshotImageExt(ext)) continue;
      files.push(full);
    } catch (err) {
      errors.push({ path: full, error: err.message });
    }
  }

  return files;
}

async function scanScreenshots(basePath, options = {}) {
  const settings = normalizeScreenshotOrganizerSettings(options.settings || options);
  const keywordMap = options.keywordMap || DEFAULT_KEYWORDS;
  const result = {
    ok: true,
    screenshotsPath: basePath,
    settings,
    items: [],
    skippedItems: [],
    errors: [],
    totalFiles: 0,
    organizableFiles: 0,
    skippedFiles: 0,
    errorFiles: 0,
    byCategory: {},
    byDateCategory: {},
    categories: CATEGORIES,
  };

  try {
    const stat = await fs.promises.stat(basePath);
    if (!stat.isDirectory()) throw new Error('Path is not a folder.');
  } catch (err) {
    return { ...result, ok: false, error: `無法讀取截圖資料夾（${basePath}）：${err.message}` };
  }

  const reservedTargets = new Set();
  const files = await collectImageFiles(basePath, settings, result.errors);
  result.totalFiles = files.length;

  for (const sourcePath of files) {
    try {
      const stat = await fs.promises.stat(sourcePath);
      if (!stat.isFile()) continue;

      const fileName = path.basename(sourcePath);
      const ext = path.extname(fileName).toLowerCase();
      const dateFolder = getScreenshotDate(fileName, stat);
      const category = classifyScreenshot(fileName, keywordMap);
      const targetBase = buildScreenshotTargetPath(
        basePath,
        dateFolder,
        category,
        fileName,
        settings,
      );
      const targetPath = getUniquePath(targetBase, reservedTargets);
      const targetDir = path.dirname(targetPath);

      if (
        settings.skipAlreadyOrganized &&
        isAlreadyOrganized(basePath, sourcePath, dateFolder, category, settings)
      ) {
        result.skippedItems.push({
          name: fileName,
          sourcePath,
          displaySource: relativeOrFull(basePath, sourcePath, settings.showFullPaths),
          category,
          dateFolder,
          reason: 'Already in the correct screenshot folder',
          status: 'skipped',
        });
        continue;
      }

      if (
        path.resolve(path.dirname(sourcePath)).toLowerCase() ===
        path.resolve(targetDir).toLowerCase()
      ) {
        result.skippedItems.push({
          name: fileName,
          sourcePath,
          displaySource: relativeOrFull(basePath, sourcePath, settings.showFullPaths),
          category,
          dateFolder,
          reason: 'Already in target folder',
          status: 'skipped',
        });
        continue;
      }

      result.items.push({
        id: `${sourcePath}|${dateFolder}|${category}`,
        name: fileName,
        ext,
        category,
        dateFolder,
        sourcePath,
        targetDir,
        targetPath,
        displaySource: relativeOrFull(basePath, sourcePath, settings.showFullPaths),
        displayTarget: relativeOrFull(basePath, targetPath, settings.showFullPaths),
        status: 'ready',
      });

      result.byCategory[category] = (result.byCategory[category] || 0) + 1;
      result.byDateCategory[dateFolder] = result.byDateCategory[dateFolder] || {};
      result.byDateCategory[dateFolder][category] =
        (result.byDateCategory[dateFolder][category] || 0) + 1;
    } catch (err) {
      result.errors.push({ path: sourcePath, name: path.basename(sourcePath), error: err.message });
    }
  }

  result.organizableFiles = result.items.length;
  result.skippedFiles = result.skippedItems.length;
  result.errorFiles = result.errors.length;
  return result;
}

async function organizeScreenshots(plan, options = {}) {
  const settings = normalizeScreenshotOrganizerSettings(options.settings || options);
  const items = Array.isArray(plan) ? plan : [];
  const reservedTargets = new Set();
  const results = [];
  const logItems = [];
  const summary = {
    moved: 0,
    failed: 0,
    skipped: 0,
    total: items.length,
    byDateCategory: {},
    failedFiles: [],
  };
  const time = new Date().toISOString();

  for (const item of items) {
    try {
      if (!item || !item.sourcePath || !item.targetDir)
        throw new Error('Invalid screenshot organize item.');
      const stat = await fs.promises.stat(item.sourcePath);
      if (!stat.isFile()) throw new Error('Source is not a file.');

      const sourceDir = path.resolve(path.dirname(item.sourcePath)).toLowerCase();
      const targetDir = path.resolve(item.targetDir).toLowerCase();
      if (sourceDir === targetDir) {
        summary.skipped += 1;
        results.push({
          name: item.name || path.basename(item.sourcePath),
          from: item.sourcePath,
          to: item.sourcePath,
          category: item.category,
          dateFolder: item.dateFolder,
          status: 'skipped',
          message: 'Already in target folder.',
        });
        logItems.push({
          from: item.sourcePath,
          to: item.sourcePath,
          dateFolder: item.dateFolder,
          category: item.category,
          status: 'skipped',
        });
        continue;
      }

      await fs.promises.mkdir(item.targetDir, { recursive: true });
      const targetPath = getUniquePath(
        path.join(item.targetDir, path.basename(item.sourcePath)),
        reservedTargets,
      );
      await moveFile(item.sourcePath, targetPath);

      summary.moved += 1;
      summary.byDateCategory[item.dateFolder] = summary.byDateCategory[item.dateFolder] || {};
      summary.byDateCategory[item.dateFolder][item.category] =
        (summary.byDateCategory[item.dateFolder][item.category] || 0) + 1;

      results.push({
        name: item.name || path.basename(item.sourcePath),
        from: item.sourcePath,
        to: targetPath,
        category: item.category,
        dateFolder: item.dateFolder,
        status: 'moved',
      });
      logItems.push({
        from: item.sourcePath,
        to: targetPath,
        dateFolder: item.dateFolder,
        category: item.category,
        status: 'success',
      });
    } catch (err) {
      const name = item ? item.name || path.basename(item.sourcePath || '') : '(unknown)';
      summary.failed += 1;
      summary.failedFiles.push({
        name,
        path: item ? item.sourcePath || '' : '',
        error: err.message,
      });
      results.push({
        name,
        from: item ? item.sourcePath || '' : '',
        to: '',
        category: item ? item.category || '' : '',
        dateFolder: item ? item.dateFolder || '' : '',
        status: 'error',
        error: err.message,
      });
      logItems.push({
        from: item ? item.sourcePath || '' : '',
        to: '',
        dateFolder: item ? item.dateFolder || '' : '',
        category: item ? item.category || '' : '',
        status: 'error',
        error: err.message,
      });
    }
  }

  let logFile = screenshotLogPath();
  let logError = null;
  if (items.length) {
    try {
      const written = await writeOrganizerLog({ time, items: logItems });
      logFile = written.path;
    } catch (err) {
      logError = err.message;
    }
  }

  return {
    ok: summary.failed === 0 && !logError,
    moved: summary.moved,
    failed: summary.failed,
    skipped: summary.skipped,
    total: summary.total,
    results,
    summary,
    logFile,
    logError,
  };
}

async function scan(config, optionOverrides = {}) {
  const basePath = getScreenshotsPath(config);
  const settings = getSettings(config, optionOverrides);
  return scanScreenshots(basePath, {
    settings,
    keywordMap: getKeywordMap(config),
  });
}

module.exports = {
  CATEGORIES,
  DEFAULT_KEYWORDS,
  getScreenshotsPath,
  getSettings,
  getKeywordMap,
  classifyScreenshot,
  buildScreenshotTargetPath,
  scanScreenshots,
  organizeScreenshots,
  scan,
};
