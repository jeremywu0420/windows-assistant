'use strict';

const path = require('path');
const { CATEGORY_RULES, getCategoryRule, normalizeExt } = require('./organizerRules');
const {
  documentSubcategoryForExt,
  getDocumentSubRule,
  isDocumentExt,
} = require('./documentClassifier');

function buildClassification(category, ext, options = {}) {
  const categoryRule = getCategoryRule(category);
  const targetSegments = [category];
  let subcategory = null;
  let label = categoryRule.label;
  let examples = categoryRule.exts;

  if (category === 'Documents' && options.subdivideDocuments !== false) {
    subcategory = documentSubcategoryForExt(ext);
    const subRule = getDocumentSubRule(subcategory);
    targetSegments.push(subcategory);
    label = `Documents/${subcategory}`;
    examples = subRule.exts.length ? subRule.exts : ['document'];
  }

  const categoryPath = targetSegments.join('/');
  return {
    category,
    subcategory,
    categoryPath,
    label,
    ext: ext || '(none)',
    targetSegments,
    examples,
  };
}

function classifyFile(fileName, options = {}) {
  const ext = normalizeExt(path.extname(fileName));
  if (!ext) return buildClassification('No Extension', ext, options);

  if (isDocumentExt(ext)) {
    return buildClassification('Documents', ext, options);
  }

  for (const rule of CATEGORY_RULES) {
    if (rule.category === 'Documents') continue;
    if (rule.exts.includes(ext)) return buildClassification(rule.category, ext, options);
  }

  return buildClassification('Others', ext, options);
}

function categoryForExt(ext, options = {}) {
  const fileName = ext ? `file${normalizeExt(ext)}` : 'file';
  return classifyFile(fileName, options).category;
}

function isHiddenLikeName(name) {
  const value = String(name || '');
  return value.startsWith('.') && value !== '.' && value !== '..';
}

module.exports = {
  classifyFile,
  categoryForExt,
  isHiddenLikeName,
};
