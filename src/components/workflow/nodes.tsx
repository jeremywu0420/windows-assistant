import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

/**
 * Custom React Flow node renderers for the three workflow node kinds. Each shows
 * its kind, its localized type label, and a short config summary. Action nodes
 * that mutate files render a "needs confirmation" badge so the danger is visible
 * on the canvas itself.
 */

interface WorkflowNodeData {
  kind: 'trigger' | 'condition' | 'action';
  label: string;
  summary?: string;
  destructive?: boolean;
  [key: string]: unknown;
}

function Shell({
  data,
  badge,
  children,
}: {
  data: WorkflowNodeData;
  badge: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`wf-node wf-node-${data.kind}${data.destructive ? ' wf-node-danger' : ''}`}>
      <div className="wf-node-badge">{badge}</div>
      <div className="wf-node-title">{data.label}</div>
      {data.summary ? <div className="wf-node-summary">{data.summary}</div> : null}
      {data.destructive ? <div className="wf-node-warn">⚠ 需確認 · review</div> : null}
      {children}
    </div>
  );
}

export function TriggerNode({ data }: NodeProps) {
  return (
    <Shell data={data as WorkflowNodeData} badge="TRIGGER">
      <Handle type="source" position={Position.Right} />
    </Shell>
  );
}

export function ConditionNode({ data }: NodeProps) {
  return (
    <Shell data={data as WorkflowNodeData} badge="IF">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </Shell>
  );
}

export function ActionNode({ data }: NodeProps) {
  return (
    <Shell data={data as WorkflowNodeData} badge="DO">
      <Handle type="target" position={Position.Left} />
    </Shell>
  );
}

export const workflowNodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
};
