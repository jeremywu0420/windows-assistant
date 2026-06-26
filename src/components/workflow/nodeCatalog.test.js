import { describe, it, expect } from 'vitest';
import { ACTION_TYPES, TRIGGER_TYPES, catalogFor, findDef, nodeLabel } from './nodeCatalog.ts';
// The engine is the source of truth for which actions are destructive.
import workflow from '../../../electron/services/workflowService.js';

const { DESTRUCTIVE_ACTIONS, isDestructiveAction } = workflow;

describe('node catalog ↔ engine contract', () => {
  it('every catalog action marked destructive is destructive in the engine', () => {
    for (const def of ACTION_TYPES) {
      if (def.destructive) {
        expect(isDestructiveAction(def.type)).toBe(true);
      }
    }
  });

  it('every engine destructive action is represented (and flagged) in the catalog', () => {
    for (const type of DESTRUCTIVE_ACTIONS) {
      const def = findDef('action', type);
      expect(def, `catalog missing action "${type}"`).toBeTruthy();
      expect(def.destructive).toBe(true);
    }
  });
});

describe('catalog helpers', () => {
  it('catalogFor returns the right list per kind', () => {
    expect(catalogFor('trigger')).toBe(TRIGGER_TYPES);
    expect(catalogFor('action')).toBe(ACTION_TYPES);
  });

  it('nodeLabel localizes and falls back to the raw type', () => {
    expect(nodeLabel('action', 'notify', 'zh')).toBe('顯示通知');
    expect(nodeLabel('action', 'notify', 'en')).toBe('Show notification');
    expect(nodeLabel('action', 'does-not-exist', 'en')).toBe('does-not-exist');
  });
});
