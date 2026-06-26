/**
 * Catalog of workflow node types — the single source the visual editor uses to
 * render the node palette and per-node property forms. Trigger/condition types
 * mirror the legacy Automations CONDITION_TYPES; action types mirror its ACTIONS,
 * so the visual editor and the old list view speak the same vocabulary.
 *
 * Labels are kept bilingual here (rather than via the i18n context) so the
 * catalog stays a plain data module usable outside React.
 */

export type NodeKind = 'trigger' | 'condition' | 'action';
export type FieldKind = 'text' | 'number' | 'folder' | 'time';

export interface FieldDef {
  key: string;
  label: string;
  labelEn: string;
  kind: FieldKind;
  placeholder?: string;
}

export interface NodeTypeDef {
  type: string;
  label: string;
  labelEn: string;
  fields: FieldDef[];
  /** Action types that mutate files — the editor marks these and gates them. */
  destructive?: boolean;
}

const folderField: FieldDef = {
  key: 'folder',
  label: '資料夾',
  labelEn: 'Folder',
  kind: 'folder',
  placeholder: 'C:\\Users\\you\\Downloads',
};
const extField: FieldDef = {
  key: 'value',
  label: '副檔名',
  labelEn: 'Extension',
  kind: 'text',
  placeholder: '.pdf',
};
const sizeField: FieldDef = {
  key: 'value',
  label: '大於 (MB)',
  labelEn: 'Larger than (MB)',
  kind: 'number',
  placeholder: '100',
};
const timeField: FieldDef = {
  key: 'time',
  label: '時間 (HH:MM)',
  labelEn: 'Time (HH:MM)',
  kind: 'time',
  placeholder: '09:00',
};

export const TRIGGER_TYPES: NodeTypeDef[] = [
  {
    type: 'newFileInFolder',
    label: '資料夾出現新檔案',
    labelEn: 'New file in folder',
    fields: [folderField],
  },
  { type: 'extension', label: '副檔名符合', labelEn: 'Matches extension', fields: [extField] },
  { type: 'sizeGreaterThan', label: '檔案大於', labelEn: 'File larger than', fields: [sizeField] },
  { type: 'schedule', label: '排程觸發', labelEn: 'On a schedule', fields: [timeField] },
];

export const CONDITION_TYPES: NodeTypeDef[] = [
  { type: 'extension', label: '副檔名符合', labelEn: 'Matches extension', fields: [extField] },
  { type: 'sizeGreaterThan', label: '檔案大於', labelEn: 'File larger than', fields: [sizeField] },
];

export const ACTION_TYPES: NodeTypeDef[] = [
  {
    type: 'organizeFileByType',
    label: '整理檔案',
    labelEn: 'Organize file',
    fields: [],
    destructive: true,
  },
  {
    type: 'organizeScreenshotByDate',
    label: '整理截圖',
    labelEn: 'Organize screenshot',
    fields: [],
    destructive: true,
  },
  {
    type: 'move',
    label: '移到指定資料夾',
    labelEn: 'Move to folder',
    fields: [{ key: 'target', label: '目標資料夾', labelEn: 'Target folder', kind: 'folder' }],
    destructive: true,
  },
  { type: 'notify', label: '顯示通知', labelEn: 'Show notification', fields: [] },
  { type: 'openFolder', label: '開啟資料夾', labelEn: 'Open folder', fields: [] },
  {
    type: 'cleanupScanSafe',
    label: 'Clean Center 安全掃描',
    labelEn: 'Clean Center safe scan',
    fields: [],
  },
  {
    type: 'cleanupReminder',
    label: '提醒檢查 Clean Center',
    labelEn: 'Clean Center reminder',
    fields: [],
  },
  {
    type: 'projectScanReminder',
    label: '提醒掃描 Project Hub',
    labelEn: 'Project Hub reminder',
    fields: [],
  },
  { type: 'healthGuardCheck', label: '健康守門員檢查', labelEn: 'Health Guard check', fields: [] },
];

const BY_KIND: Record<NodeKind, NodeTypeDef[]> = {
  trigger: TRIGGER_TYPES,
  condition: CONDITION_TYPES,
  action: ACTION_TYPES,
};

export function catalogFor(kind: NodeKind): NodeTypeDef[] {
  return BY_KIND[kind] || [];
}

export function findDef(kind: NodeKind, type: string): NodeTypeDef | undefined {
  return catalogFor(kind).find((def) => def.type === type);
}

export function nodeLabel(kind: NodeKind, type: string, language: string): string {
  const def = findDef(kind, type);
  if (!def) return type;
  return language === 'zh' ? def.label : def.labelEn;
}

export function fieldLabel(field: FieldDef, language: string): string {
  return language === 'zh' ? field.label : field.labelEn;
}

/** A handful of ready-made workflows shown as starter templates / examples. */
export function starterTemplates(): { name: string; nameEn: string; build: () => unknown }[] {
  return [
    {
      name: '整理下載資料夾',
      nameEn: 'Tidy Downloads',
      build: () => ({
        nodes: [
          { kind: 'trigger', type: 'newFileInFolder', config: {}, position: { x: 60, y: 120 } },
          { kind: 'action', type: 'organizeFileByType', config: {}, position: { x: 360, y: 120 } },
        ],
      }),
    },
    {
      name: '大檔案提醒',
      nameEn: 'Large-file reminder',
      build: () => ({
        nodes: [
          {
            kind: 'trigger',
            type: 'sizeGreaterThan',
            config: { value: 500 },
            position: { x: 60, y: 120 },
          },
          { kind: 'action', type: 'notify', config: {}, position: { x: 360, y: 120 } },
        ],
      }),
    },
  ];
}
