'use strict';

const DOCUMENT_SUB_RULES = [
  { category: 'PDF', label: 'PDF', exts: ['.pdf'] },
  { category: 'PowerPoint', label: 'PowerPoint', exts: ['.ppt', '.pptx', '.pps', '.ppsx'] },
  { category: 'Word', label: 'Word', exts: ['.doc', '.docx', '.rtf', '.odt'] },
  { category: 'Excel', label: 'Excel', exts: ['.xls', '.xlsx', '.csv', '.ods'] },
  {
    category: 'Text',
    label: 'Text',
    exts: ['.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.log'],
  },
  { category: 'Ebooks', label: 'Ebooks', exts: ['.epub', '.mobi', '.azw', '.azw3'] },
  { category: 'Others', label: 'Others', exts: ['.unknown'] },
];

const CATEGORY_RULES = [
  {
    category: 'Images',
    label: 'Images',
    exts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.heic'],
  },
  {
    category: 'Videos',
    label: 'Videos',
    exts: ['.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm', '.m4v'],
  },
  { category: 'Music', label: 'Music', exts: ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg'] },
  {
    category: 'Documents',
    label: 'Documents',
    exts: DOCUMENT_SUB_RULES.flatMap((rule) => rule.exts),
  },
  { category: 'Archives', label: 'Archives', exts: ['.zip', '.rar', '.7z', '.tar', '.gz', '.iso'] },
  { category: 'Installers', label: 'Installers', exts: ['.exe', '.msi', '.apk', '.appx'] },
  {
    category: 'Code',
    label: 'Code',
    exts: [
      '.c',
      '.cpp',
      '.h',
      '.hpp',
      '.cs',
      '.java',
      '.py',
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.html',
      '.css',
      '.sql',
    ],
  },
  // Engineering: electrical / electronics design files. HDL (.v/.sv moved here from Code),
  // EDA/PCB (KiCad/Gerber), SPICE/LTspice simulation, firmware, and MATLAB.
  {
    category: 'Engineering',
    label: 'Engineering',
    exts: [
      '.vhd',
      '.vhdl',
      '.vh',
      '.v',
      '.sv',
      '.svh',
      '.kicad_pcb',
      '.kicad_sch',
      '.kicad_pro',
      '.sch',
      '.brd',
      '.gbr',
      '.drl',
      '.net',
      '.asc',
      '.asy',
      '.cir',
      '.sp',
      '.raw',
      '.ino',
      '.hex',
      '.elf',
      '.uf2',
      '.m',
      '.mat',
      '.slx',
      '.mdl',
      '.mlx',
    ],
  },
  { category: 'Subtitles', label: 'Subtitles', exts: ['.srt', '.ass', '.vtt'] },
  { category: 'Torrents', label: 'Torrents', exts: ['.torrent'] },
  { category: 'Fonts', label: 'Fonts', exts: ['.ttf', '.otf', '.woff', '.woff2'] },
  { category: 'Design', label: 'Design', exts: ['.psd', '.ai', '.fig', '.xd'] },
  { category: '3D', label: '3D', exts: ['.obj', '.fbx', '.stl', '.blend'] },
  { category: 'No Extension', label: 'No Extension', exts: [] },
  { category: 'Others', label: 'Others', exts: [] },
];

const CATEGORY_NAMES = new Set(CATEGORY_RULES.map((rule) => rule.category.toLowerCase()));
const DOCUMENT_SUBCATEGORY_NAMES = new Set(
  DOCUMENT_SUB_RULES.map((rule) => rule.category.toLowerCase()),
);
const DOCUMENT_EXTS = new Set(DOCUMENT_SUB_RULES.flatMap((rule) => rule.exts));

function normalizeExt(ext) {
  const value = String(ext || '')
    .trim()
    .toLowerCase();
  if (!value) return '';
  return value.startsWith('.') ? value : `.${value}`;
}

function getCategoryRule(category) {
  const target = String(category || '').split(/[\\/]/)[0];
  return (
    CATEGORY_RULES.find((rule) => rule.category === target) ||
    CATEGORY_RULES[CATEGORY_RULES.length - 1]
  );
}

function getDocumentSubRule(subcategory) {
  return (
    DOCUMENT_SUB_RULES.find((rule) => rule.category === subcategory) ||
    DOCUMENT_SUB_RULES[DOCUMENT_SUB_RULES.length - 1]
  );
}

function isTopLevelCategoryFolderName(name) {
  return CATEGORY_NAMES.has(String(name || '').toLowerCase());
}

function isDocumentSubcategoryFolderName(name) {
  return DOCUMENT_SUBCATEGORY_NAMES.has(String(name || '').toLowerCase());
}

module.exports = {
  CATEGORY_RULES,
  DOCUMENT_SUB_RULES,
  CATEGORY_NAMES,
  DOCUMENT_EXTS,
  DOCUMENT_SUBCATEGORY_NAMES,
  normalizeExt,
  getCategoryRule,
  getDocumentSubRule,
  isTopLevelCategoryFolderName,
  isDocumentSubcategoryFolderName,
};
