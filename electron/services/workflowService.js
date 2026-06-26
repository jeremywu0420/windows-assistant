'use strict';

/**
 * Workflow engine — the execution layer behind the visual automation editor.
 *
 * A workflow is a directed graph of nodes:
 *   - trigger   : what starts the workflow (a new file, a schedule, manual run)
 *   - condition : a filter that prunes a branch when it doesn't match
 *   - action    : something to do (organize, clean, notify, …)
 *
 * The engine deliberately reuses the existing, battle-tested primitives from
 * automationService — `matches()` for predicates and `runAction()` for side
 * effects — so the visual layer is genuinely an *upgrade* of the flat rule
 * system rather than a parallel reimplementation.
 *
 * Safety: destructive action nodes (those that move/clean files) are flagged so
 * the renderer can require review-first confirmation, and `dryRun` walks the
 * exact same graph while executing nothing.
 */

const automationService = require('./automationService');

/**
 * Action types that move, delete, or otherwise mutate the user's files. The
 * renderer must gate these behind the existing confirmation dialog, and dry-run
 * never executes them. Reminder/notify/scan actions are read-only and safe.
 */
const DESTRUCTIVE_ACTIONS = new Set(['move', 'organizeFileByType', 'organizeScreenshotByDate']);

function isDestructiveAction(type) {
  return DESTRUCTIVE_ACTIONS.has(type);
}

function isDestructiveNode(node) {
  return !!node && node.kind === 'action' && isDestructiveAction(node.type);
}

// ---- Graph helpers --------------------------------------------------------

function nodeById(workflow) {
  const map = new Map();
  for (const node of (workflow && workflow.nodes) || []) {
    if (node && node.id) map.set(node.id, node);
  }
  return map;
}

/** Build a source-id -> [target node id] adjacency list from the edges. */
function adjacency(workflow) {
  const adj = new Map();
  for (const edge of (workflow && workflow.edges) || []) {
    if (!edge || !edge.source || !edge.target) continue;
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source).push(edge.target);
  }
  return adj;
}

/** Turn a trigger/condition node's config into an automationService condition. */
function nodeCondition(node) {
  return { type: node.type, ...(node.config || {}) };
}

/** Turn an action node's config into an automationService action. */
function nodeAction(node) {
  return { type: node.type, ...(node.config || {}) };
}

/**
 * Does this trigger node fire for the given event?
 *  - manual run fires every trigger (the user asked for it explicitly)
 *  - schedule events fire `schedule` triggers
 *  - file events fire file-shaped triggers, delegated to automationService.matches
 */
function triggerFires(node, event) {
  if (!node || node.kind !== 'trigger') return false;
  const kind = event && event.kind;
  if (kind === 'manual') return true;
  if (node.type === 'schedule') return kind === 'schedule';
  if (kind !== 'file') return false;

  const info = (event && event.info) || {};
  // A folder-scoped trigger only fires for files inside that folder.
  const cond = nodeCondition(node);
  if (node.type === 'newFileInFolder' && cond.folder) {
    try {
      const path = require('path');
      if (path.resolve(cond.folder) !== path.resolve(info.folder || '')) return false;
    } catch (_) {
      return false;
    }
  }
  return automationService.matches(cond, info);
}

// ---- Execution ------------------------------------------------------------

/**
 * Run a single workflow against a trigger event.
 *
 * @param {object} workflow  { id, name, enabled, nodes, edges }
 * @param {object} event     { kind: 'manual'|'file'|'schedule', info? }
 * @param {object} config    full app settings (passed through to runAction)
 * @param {object} [options] { dryRun }
 * @returns {Promise<{ ok, dryRun, skipped?, steps }>}
 */
async function runWorkflow(workflow, event = { kind: 'manual' }, config = {}, options = {}) {
  const dryRun = !!options.dryRun;
  if (!workflow || workflow.enabled === false) {
    return { ok: false, dryRun, skipped: 'disabled', steps: [] };
  }

  const nodes = nodeById(workflow);
  const adj = adjacency(workflow);
  const info = (event && event.info) || { file: '', path: '', folder: '', ext: '', size: 0 };
  const steps = [];
  const executedActions = new Set();

  // Walk a branch starting just past a trigger. Condition nodes gate their
  // descendants; action nodes execute (or are recorded, in dry-run).
  async function walk(nodeId, visited) {
    if (visited.has(nodeId)) return; // guard against cycles
    visited.add(nodeId);
    const node = nodes.get(nodeId);
    if (!node) return;

    if (node.kind === 'condition') {
      if (!automationService.matches(nodeCondition(node), info)) return; // prune branch
    } else if (node.kind === 'action') {
      if (!executedActions.has(node.id)) {
        executedActions.add(node.id);
        const destructive = isDestructiveNode(node);
        if (dryRun) {
          steps.push({ nodeId: node.id, type: node.type, destructive, dryRun: true, ok: true });
        } else {
          const result = await automationService.runAction(nodeAction(node), info, config);
          steps.push({ nodeId: node.id, type: node.type, destructive, ...result });
        }
      }
    }

    for (const next of adj.get(nodeId) || []) {
      await walk(next, visited);
    }
  }

  let triggered = false;
  for (const node of nodes.values()) {
    if (node.kind !== 'trigger') continue;
    if (!triggerFires(node, event)) continue;
    triggered = true;
    for (const next of adj.get(node.id) || []) {
      await walk(next, new Set());
    }
  }

  if (!triggered) return { ok: true, dryRun, skipped: 'no-trigger', steps: [] };
  const ok = steps.every((step) => step.ok !== false);
  return { ok, dryRun, name: workflow.name, steps };
}

function dryRunWorkflow(workflow, event, config) {
  return runWorkflow(workflow, event, config, { dryRun: true });
}

// ---- Backward compatibility ----------------------------------------------

let idCounter = 0;
function genId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

/**
 * Convert a legacy flat automation rule ({ condition, action }) into a minimal
 * two-node workflow graph (trigger -> action), preserving id/name/enabled so no
 * existing rule is lost when the user opens the visual editor for the first time.
 */
function automationToWorkflow(rule) {
  const condition = rule.condition || { type: 'newFileInFolder' };
  const action = rule.action || { type: 'notify' };
  const triggerId = genId('trigger');
  const actionId = genId('action');
  const { type: condType, ...condConfig } = condition;
  const { type: actionType, ...actionConfig } = action;
  return {
    id: rule.id || genId('wf'),
    name: rule.name || 'Imported automation',
    enabled: rule.enabled !== false,
    nodes: [
      {
        id: triggerId,
        kind: 'trigger',
        type: condType || 'newFileInFolder',
        config: condConfig,
        position: { x: 80, y: 80 },
      },
      {
        id: actionId,
        kind: 'action',
        type: actionType || 'notify',
        config: actionConfig,
        position: { x: 80, y: 240 },
      },
    ],
    edges: [{ id: genId('edge'), source: triggerId, target: actionId }],
  };
}

function migrateAutomationsToWorkflows(automations) {
  if (!Array.isArray(automations)) return [];
  return automations.map(automationToWorkflow);
}

/**
 * Read the workflow list from settings. If none exist yet but legacy flat
 * automations do, transparently migrate them so the upgrade is seamless.
 */
function listWorkflows(config) {
  if (config && Array.isArray(config.workflows) && config.workflows.length) {
    return config.workflows;
  }
  if (config && Array.isArray(config.automations) && config.automations.length) {
    return migrateAutomationsToWorkflows(config.automations);
  }
  return Array.isArray(config && config.workflows) ? config.workflows : [];
}

module.exports = {
  DESTRUCTIVE_ACTIONS,
  isDestructiveAction,
  isDestructiveNode,
  triggerFires,
  runWorkflow,
  dryRunWorkflow,
  automationToWorkflow,
  migrateAutomationsToWorkflows,
  listWorkflows,
};
