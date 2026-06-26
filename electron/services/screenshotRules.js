'use strict';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
const CATEGORIES = ['Code', 'Circuit', 'Report', 'School', 'Other'];

const DEFAULT_KEYWORDS = {
  Code: [
    'code',
    'vscode',
    'terminal',
    'bug',
    'error',
    'leetcode',
    'program',
    'compile',
    '程式',
    '報錯',
  ],
  Circuit: [
    'circuit',
    'kmap',
    'logic',
    'pcb',
    'schematic',
    'spice',
    'ltspice',
    'multisim',
    'proteus',
    'waveform',
    'fpga',
    'verilog',
    'vhdl',
    'quartus',
    'vivado',
    'simulink',
    'matlab',
    'oscilloscope',
    'bode',
    'fft',
    'datasheet',
    '電路',
    '波形',
    '示波器',
    '規格書',
    '模擬',
  ],
  Report: ['report', 'paper', 'thesis', 'doc', '報告', '論文'],
  School: [
    'hw',
    'homework',
    'lecture',
    'class',
    'exam',
    'quiz',
    'course',
    '作業',
    '上課',
    '課程',
    '考試',
  ],
};

const DEFAULT_SCREENSHOT_ORGANIZER_SETTINGS = {
  organizeByDate: true,
  categoryUnderDate: true,
  renameConflicts: true,
  skipAlreadyOrganized: true,
  includeSubfolders: false,
  includeHiddenFiles: false,
  showFullPaths: false,
};

function normalizeScreenshotOrganizerSettings(input = {}) {
  return {
    ...DEFAULT_SCREENSHOT_ORGANIZER_SETTINGS,
    ...input,
    organizeByDate: input.organizeByDate !== false,
    categoryUnderDate: input.categoryUnderDate !== false,
    renameConflicts: true,
    skipAlreadyOrganized: input.skipAlreadyOrganized !== false,
    includeSubfolders: !!input.includeSubfolders,
    includeHiddenFiles: !!input.includeHiddenFiles,
    showFullPaths: !!input.showFullPaths,
  };
}

function isScreenshotImageExt(ext) {
  return IMAGE_EXTS.includes(String(ext || '').toLowerCase());
}

function isHiddenLikeName(name) {
  const value = String(name || '');
  return value.startsWith('.') && value !== '.' && value !== '..';
}

function isDateFolderName(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(name || ''));
}

function isCategoryFolderName(name) {
  return CATEGORIES.some((category) => category.toLowerCase() === String(name || '').toLowerCase());
}

function getKeywordMap(config) {
  const fromConfig = config && config.screenshots && config.screenshots.keywords;
  if (fromConfig && typeof fromConfig === 'object') {
    return { ...DEFAULT_KEYWORDS, ...fromConfig };
  }
  return DEFAULT_KEYWORDS;
}

function classifyScreenshot(fileName, keywordMap = DEFAULT_KEYWORDS) {
  const lower = String(fileName || '').toLowerCase();
  for (const category of ['Code', 'Circuit', 'Report', 'School']) {
    const words = keywordMap[category] || [];
    if (words.some((word) => word && lower.includes(String(word).toLowerCase()))) {
      return category;
    }
  }
  return 'Other';
}

module.exports = {
  IMAGE_EXTS,
  CATEGORIES,
  DEFAULT_KEYWORDS,
  DEFAULT_SCREENSHOT_ORGANIZER_SETTINGS,
  normalizeScreenshotOrganizerSettings,
  isScreenshotImageExt,
  isHiddenLikeName,
  isDateFolderName,
  isCategoryFolderName,
  getKeywordMap,
  classifyScreenshot,
};
