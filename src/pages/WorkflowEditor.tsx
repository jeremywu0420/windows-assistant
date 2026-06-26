import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../styles/workflow.css';
import { useLocale } from '../i18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { workflowNodeTypes } from '../components/workflow/nodes.tsx';
import {
  catalogFor,
  fieldLabel,
  findDef,
  nodeLabel,
  starterTemplates,
  type NodeKind,
} from '../components/workflow/nodeCatalog.ts';

interface WorkflowNodeModel {
  id: string;
  kind: NodeKind;
  type: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}
interface WorkflowEdgeModel {
  id: string;
  source: string;
  target: string;
}
interface WorkflowModel {
  id: string;
  name: string;
  enabled: boolean;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
}

type RFNode = Node<Record<string, unknown>>;

const uid = (prefix: string): string =>
  `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;

function summarize(config: Record<string, unknown>): string {
  const parts = Object.entries(config)
    .filter(([, v]) => v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${k}: ${v}`);
  return parts.join(' · ');
}

/** Model node -> React Flow node (with localized label + danger flag). */
function toRfNode(node: WorkflowNodeModel, language: string): RFNode {
  const def = findDef(node.kind, node.type);
  return {
    id: node.id,
    type: node.kind,
    position: node.position || { x: 80, y: 80 },
    data: {
      kind: node.kind,
      nodeType: node.type,
      config: node.config || {},
      label: nodeLabel(node.kind, node.type, language),
      summary: summarize(node.config || {}),
      destructive: node.kind === 'action' && !!def?.destructive,
    },
  };
}

function toRf(wf: WorkflowModel, language: string): { nodes: RFNode[]; edges: Edge[] } {
  return {
    nodes: (wf.nodes || []).map((n) => toRfNode(n, language)),
    edges: (wf.edges || []).map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

/** React Flow graph -> model node list (persisted to settings). */
function fromRf(
  nodes: RFNode[],
  edges: Edge[],
): { nodes: WorkflowNodeModel[]; edges: WorkflowEdgeModel[] } {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: (n.data.kind as NodeKind) || 'action',
      type: (n.data.nodeType as string) || '',
      config: (n.data.config as Record<string, unknown>) || {},
      position: n.position,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

export default function WorkflowEditor({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { language } = useLocale();
  const toastCtx = useToast() as { toast?: (message: string, type?: string) => void } | null;
  const notify = (message: string, type?: string) => toastCtx?.toast?.(message, type);
  const zh = language === 'zh';

  const [workflows, setWorkflows] = useState<WorkflowModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runOutput, setRunOutput] = useState<string | null>(null);

  const api = (typeof window !== 'undefined' ? (window as Window).api : undefined) as
    | { workflows?: Record<string, (...args: unknown[]) => Promise<unknown>> }
    | undefined;

  const load = useCallback(async () => {
    if (!api?.workflows?.list) return;
    const res = (await api.workflows.list()) as { ok?: boolean; workflows?: WorkflowModel[] };
    if (res?.ok && Array.isArray(res.workflows)) {
      setWorkflows(res.workflows);
      if (res.workflows.length && !selectedId) selectWorkflow(res.workflows[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function selectWorkflow(wf: WorkflowModel) {
    setSelectedId(wf.id);
    const rf = toRf(wf, language);
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setSelectedNodeId(null);
    setRunOutput(null);
  }

  const selected = useMemo(
    () => workflows.find((w) => w.id === selectedId) || null,
    [workflows, selectedId],
  );
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as RFNode[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge({ ...conn, id: uid('edge') }, eds)),
    [],
  );

  function addNode(kind: NodeKind) {
    const def = catalogFor(kind)[0];
    if (!def) return;
    const id = uid(kind);
    const node: RFNode = {
      id,
      type: kind,
      position: { x: 120 + nodes.length * 30, y: 120 + nodes.length * 20 },
      data: {
        kind,
        nodeType: def.type,
        config: {},
        label: nodeLabel(kind, def.type, language),
        summary: '',
        destructive: kind === 'action' && !!def.destructive,
      },
    };
    setNodes((n) => [...n, node]);
    setSelectedNodeId(id);
  }

  function patchNodeData(id: string, patch: Record<string, unknown>) {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        const data = { ...n.data, ...patch };
        const kind = data.kind as NodeKind;
        const type = data.nodeType as string;
        const def = findDef(kind, type);
        data.label = nodeLabel(kind, type, language);
        data.summary = summarize((data.config as Record<string, unknown>) || {});
        data.destructive = kind === 'action' && !!def?.destructive;
        return { ...n, data };
      }),
    );
  }

  function changeNodeType(type: string) {
    if (!selectedNode) return;
    // Reset config when switching type so stale fields don't linger.
    patchNodeData(selectedNode.id, { nodeType: type, config: {} });
  }

  function changeNodeField(key: string, value: string) {
    if (!selectedNode) return;
    const config = { ...((selectedNode.data.config as Record<string, unknown>) || {}) };
    if (value === '') delete config[key];
    else config[key] = value;
    patchNodeData(selectedNode.id, { config });
  }

  function deleteSelectedNode() {
    if (!selectedNode) return;
    const id = selectedNode.id;
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedNodeId(null);
  }

  function buildWorkflowList(): WorkflowModel[] {
    if (!selected) return workflows;
    const graph = fromRf(nodes, edges);
    const updated: WorkflowModel = { ...selected, ...graph };
    return workflows.map((w) => (w.id === selected.id ? updated : w));
  }

  async function persist(list: WorkflowModel[]): Promise<boolean> {
    if (!api?.workflows?.save) return false;
    const res = (await api.workflows.save(list)) as { ok?: boolean; error?: string };
    if (res?.ok) {
      setWorkflows(list);
      return true;
    }
    notify(res?.error || (zh ? '儲存失敗' : 'Save failed'), 'error');
    return false;
  }

  async function save() {
    setBusy(true);
    const ok = await persist(buildWorkflowList());
    setBusy(false);
    if (ok) notify(zh ? '工作流已儲存' : 'Workflow saved', 'success');
  }

  function newWorkflow() {
    const wf: WorkflowModel = {
      id: uid('wf'),
      name: zh ? '新工作流' : 'New workflow',
      enabled: true,
      nodes: [],
      edges: [],
    };
    const list = [...workflows, wf];
    setWorkflows(list);
    selectWorkflow(wf);
  }

  function applyTemplate(build: () => unknown) {
    const tpl = build() as { nodes: Omit<WorkflowNodeModel, 'id'>[] };
    const ids = tpl.nodes.map(() => uid('n'));
    const modelNodes: WorkflowNodeModel[] = tpl.nodes.map((n, i) => ({ ...n, id: ids[i] }));
    const modelEdges: WorkflowEdgeModel[] = [];
    for (let i = 0; i < ids.length - 1; i += 1) {
      modelEdges.push({ id: uid('edge'), source: ids[i], target: ids[i + 1] });
    }
    const rf = toRf(
      { id: '', name: '', enabled: true, nodes: modelNodes, edges: modelEdges },
      language,
    );
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setSelectedNodeId(null);
  }

  async function renameSelected(name: string) {
    if (!selected) return;
    setWorkflows((list) => list.map((w) => (w.id === selected.id ? { ...w, name } : w)));
  }

  async function toggleEnabled(wf: WorkflowModel) {
    if (!api?.workflows?.setEnabled) return;
    await api.workflows.setEnabled(wf.id, !wf.enabled);
    setWorkflows((list) => list.map((w) => (w.id === wf.id ? { ...w, enabled: !w.enabled } : w)));
  }

  async function deleteSelected() {
    if (!selected) return;
    const list = workflows.filter((w) => w.id !== selected.id);
    const ok = await persist(list);
    if (ok) {
      setSelectedId(list[0]?.id || null);
      if (list[0]) selectWorkflow(list[0]);
      else {
        setNodes([]);
        setEdges([]);
      }
    }
  }

  async function dryRun() {
    if (!selected || !api?.workflows?.dryRun) return;
    setBusy(true);
    const saved = await persist(buildWorkflowList());
    if (!saved) return setBusy(false);
    const res = (await api.workflows.dryRun(selected.id)) as {
      ok?: boolean;
      steps?: { type: string; destructive?: boolean }[];
      skipped?: string;
    };
    setBusy(false);
    if (res?.skipped === 'no-trigger') {
      setRunOutput(zh ? '沒有符合的觸發節點。' : 'No matching trigger node.');
      return;
    }
    const steps = res?.steps || [];
    if (!steps.length) {
      setRunOutput(zh ? '這個工作流不會執行任何動作。' : 'This workflow would do nothing.');
      return;
    }
    const lines = steps.map(
      (s, i) =>
        `${i + 1}. ${nodeLabel('action', s.type, language)}${s.destructive ? (zh ? '（需確認）' : ' (needs confirmation)') : ''}`,
    );
    setRunOutput((zh ? '預演 — 將會執行：\n' : 'Dry run — would run:\n') + lines.join('\n'));
  }

  async function run() {
    if (!selected || !api?.workflows?.run) return;
    setBusy(true);
    const saved = await persist(buildWorkflowList());
    if (!saved) return setBusy(false);
    // Review-first: if any action is destructive, confirm before executing.
    const hasDestructive = nodes.some((n) => n.data.destructive);
    if (hasDestructive) {
      const proceed = window.confirm(
        zh
          ? '此工作流包含會移動/清理檔案的步驟，確定要執行嗎？'
          : 'This workflow moves or cleans files. Run it now?',
      );
      if (!proceed) return setBusy(false);
    }
    const res = (await api.workflows.run(selected.id)) as {
      ok?: boolean;
      steps?: { type: string; ok?: boolean; error?: string }[];
      skipped?: string;
    };
    setBusy(false);
    if (res?.skipped === 'no-trigger') {
      setRunOutput(zh ? '沒有符合的觸發節點。' : 'No matching trigger node.');
      return;
    }
    const steps = res?.steps || [];
    const lines = steps.map(
      (s, i) =>
        `${i + 1}. ${nodeLabel('action', s.type, language)} — ${s.ok === false ? `✗ ${s.error || ''}` : '✓'}`,
    );
    setRunOutput(
      (res?.ok
        ? zh
          ? '已執行：\n'
          : 'Executed:\n'
        : zh
          ? '部分失敗：\n'
          : 'Some steps failed:\n') + (lines.join('\n') || (zh ? '（無動作）' : '(no actions)')),
    );
    notify(
      res?.ok ? (zh ? '工作流已執行' : 'Workflow ran') : zh ? '部分步驟失敗' : 'Some steps failed',
      res?.ok ? 'success' : 'error',
    );
  }

  const selectedDef = selectedNode
    ? findDef(selectedNode.data.kind as NodeKind, selectedNode.data.nodeType as string)
    : undefined;

  return (
    <div className="wf-page">
      <div className="wf-toolbar">
        <div className="wf-toolbar-left">
          <button className="wf-btn" onClick={() => onNavigate?.('automations')}>
            ← {zh ? '自動化' : 'Automations'}
          </button>
          <h1>{zh ? '視覺化自動化' : 'Visual Automation'}</h1>
        </div>
        <div className="wf-toolbar-right">
          <button className="wf-btn" onClick={() => addNode('trigger')}>
            + {zh ? '觸發' : 'Trigger'}
          </button>
          <button className="wf-btn" onClick={() => addNode('condition')}>
            + {zh ? '條件' : 'Condition'}
          </button>
          <button className="wf-btn" onClick={() => addNode('action')}>
            + {zh ? '動作' : 'Action'}
          </button>
          <button className="wf-btn" disabled={busy || !selected} onClick={dryRun}>
            {zh ? '預演' : 'Dry run'}
          </button>
          <button className="wf-btn wf-btn-primary" disabled={busy || !selected} onClick={run}>
            {zh ? '執行' : 'Run'}
          </button>
          <button className="wf-btn wf-btn-primary" disabled={busy || !selected} onClick={save}>
            {zh ? '儲存' : 'Save'}
          </button>
        </div>
      </div>

      <div className="wf-body">
        <aside className="wf-list">
          <div className="wf-list-head">
            <span>{zh ? '工作流' : 'Workflows'}</span>
            <button className="wf-btn wf-btn-sm" onClick={newWorkflow}>
              +
            </button>
          </div>
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className={`wf-list-item${wf.id === selectedId ? ' active' : ''}`}
              onClick={() => selectWorkflow(wf)}
            >
              <span className={`wf-dot${wf.enabled ? ' on' : ''}`} />
              <span className="wf-list-name">{wf.name}</span>
              <button
                className="wf-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleEnabled(wf);
                }}
              >
                {wf.enabled ? (zh ? '啟用' : 'On') : zh ? '停用' : 'Off'}
              </button>
            </div>
          ))}
          {workflows.length === 0 ? (
            <div className="wf-empty">{zh ? '尚無工作流' : 'No workflows yet'}</div>
          ) : null}
          <div className="wf-templates">
            <div className="wf-templates-title">{zh ? '範本' : 'Templates'}</div>
            {starterTemplates().map((tpl) => (
              <button
                key={tpl.nameEn}
                className="wf-btn wf-btn-sm wf-tpl"
                disabled={!selected}
                onClick={() => applyTemplate(tpl.build)}
              >
                {zh ? tpl.name : tpl.nameEn}
              </button>
            ))}
          </div>
        </aside>

        <div className="wf-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={workflowNodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        <aside className="wf-inspector">
          {selected ? (
            <div className="wf-field">
              <label>{zh ? '工作流名稱' : 'Workflow name'}</label>
              <input
                value={selected.name}
                onChange={(e) => renameSelected(e.target.value)}
                placeholder={zh ? '名稱' : 'Name'}
              />
            </div>
          ) : null}

          {selectedNode ? (
            <>
              <div className="wf-field">
                <label>{zh ? '節點類型' : 'Node type'}</label>
                <select
                  value={selectedNode.data.nodeType as string}
                  onChange={(e) => changeNodeType(e.target.value)}
                >
                  {catalogFor(selectedNode.data.kind as NodeKind).map((def) => (
                    <option key={def.type} value={def.type}>
                      {zh ? def.label : def.labelEn}
                    </option>
                  ))}
                </select>
              </div>
              {(selectedDef?.fields || []).map((field) => (
                <div className="wf-field" key={field.key}>
                  <label>{fieldLabel(field, language)}</label>
                  <input
                    type={field.kind === 'number' ? 'number' : 'text'}
                    value={String(
                      ((selectedNode.data.config as Record<string, unknown>) || {})[field.key] ??
                        '',
                    )}
                    placeholder={field.placeholder}
                    onChange={(e) => changeNodeField(field.key, e.target.value)}
                  />
                </div>
              ))}
              <button className="wf-btn wf-btn-danger" onClick={deleteSelectedNode}>
                {zh ? '刪除節點' : 'Delete node'}
              </button>
            </>
          ) : (
            <div className="wf-hint">
              {zh
                ? '點選畫布上的節點來編輯，或用上方按鈕新增。拖曳節點右側圓點連到下一個節點。'
                : 'Click a node to edit, or add one above. Drag from a node’s right dot to connect.'}
            </div>
          )}

          {selected ? (
            <button className="wf-btn wf-btn-danger wf-delete-wf" onClick={deleteSelected}>
              {zh ? '刪除此工作流' : 'Delete workflow'}
            </button>
          ) : null}

          {runOutput ? <pre className="wf-output">{runOutput}</pre> : null}
        </aside>
      </div>
    </div>
  );
}
