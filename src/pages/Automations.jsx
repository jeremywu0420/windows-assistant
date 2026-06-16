import React, { useEffect, useState, useCallback } from 'react';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import Toggle from '../components/Toggle.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Dialog from '../components/Dialog.jsx';
import { useToast } from '../components/Toast.jsx';

const inp = {
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '7px 9px',
  fontSize: 13,
};

const CONDITIONS = [
  { type: 'extension', label: '副檔名為', placeholder: '.pdf' },
  { type: 'sizeGreaterThan', label: '檔案大於 (MB)', placeholder: '100' },
  { type: 'newFileInFolder', label: '資料夾有新檔案', placeholder: '' },
];
const ACTIONS = [
  { type: 'move', label: '移動到資料夾' },
  { type: 'notify', label: '顯示通知' },
  { type: 'openFolder', label: '開啟資料夾' },
];

function blankRule() {
  const now = new Date().toISOString();
  return {
    id: `a_${Date.now()}`,
    name: '新規則',
    enabled: true,
    condition: { type: 'extension', value: '', folder: '' },
    action: { type: 'notify', target: '' },
    createdAt: now,
    updatedAt: now,
  };
}

export default function Automations() {
  const { toast } = useToast();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);

  const load = useCallback(async () => {
    if (!window.api) return;
    setLoading(true);
    const res = await window.api.listAutomations();
    setRules(res.automations || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = async (next) => {
    setRules(next);
    const r = await window.api.saveAutomations(next);
    if (!r.ok) toast(r.error || '儲存失敗', 'error');
  };

  const update = (id, patch) =>
    persist(rules.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)));
  const updateCond = (id, patch) => {
    const r = rules.find((x) => x.id === id);
    update(id, { condition: { ...r.condition, ...patch } });
  };
  const updateAct = (id, patch) => {
    const r = rules.find((x) => x.id === id);
    update(id, { action: { ...r.action, ...patch } });
  };
  const addRule = () => persist([...rules, blankRule()]).then(() => toast('已新增規則', 'ok'));
  const removeRule = (id) => { persist(rules.filter((r) => r.id !== id)); setConfirmId(null); toast('已刪除規則', 'ok'); };

  const pickFolder = async (id, where) => {
    const r = await window.api.pickPath({ type: 'folder', title: '選擇資料夾' });
    if (r.ok) {
      if (where === 'condition') updateCond(id, { folder: r.path });
      else updateAct(id, { target: r.path });
    }
  };

  return (
    <div>
      <div className="row-between">
        <div>
          <h1 className="page-title">Automations</h1>
          <p className="page-subtitle">當偵測到新檔案時，依條件自動執行動作（只在監控開啟時生效）。</p>
        </div>
        <Button variant="primary" icon="➕" onClick={addRule}>新增規則</Button>
      </div>

      {loading ? (
        <div className="loading-block"><span className="spinner" /> 載入中…</div>
      ) : rules.length === 0 ? (
        <Card>
          <EmptyState
            icon="⚡"
            title="尚無自動化規則"
            description="建立規則，例如「副檔名為 .pdf → 移動到 Documents」。"
            action={<Button variant="primary" icon="➕" onClick={addRule}>建立第一條規則</Button>}
          />
        </Card>
      ) : (
        rules.map((r) => {
          const condMeta = CONDITIONS.find((c) => c.type === r.condition.type) || CONDITIONS[0];
          return (
            <Card key={r.id} style={{ marginBottom: 14 }}>
              <div className="row-between" style={{ marginBottom: 12 }}>
                <input style={{ ...inp, fontWeight: 700, minWidth: 200 }} value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Toggle checked={r.enabled !== false} onChange={(v) => update(r.id, { enabled: v })} />
                  <Button variant="danger" size="sm" icon="🗑️" onClick={() => setConfirmId(r.id)}>刪除</Button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>When（條件）</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select style={inp} value={r.condition.type} onChange={(e) => updateCond(r.id, { type: e.target.value })}>
                      {CONDITIONS.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
                    </select>
                    {r.condition.type === 'newFileInFolder' ? (
                      <>
                        <input style={{ ...inp, minWidth: 220 }} placeholder="資料夾路徑" value={r.condition.folder || ''} onChange={(e) => updateCond(r.id, { folder: e.target.value })} />
                        <Button size="sm" icon="📁" onClick={() => pickFolder(r.id, 'condition')} />
                      </>
                    ) : (
                      <input style={{ ...inp, width: 120 }} placeholder={condMeta.placeholder} value={r.condition.value || ''} onChange={(e) => updateCond(r.id, { value: e.target.value })} />
                    )}
                  </div>
                </div>

                <div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Then（動作）</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select style={inp} value={r.action.type} onChange={(e) => updateAct(r.id, { type: e.target.value })}>
                      {ACTIONS.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
                    </select>
                    {r.action.type === 'move' ? (
                      <>
                        <input style={{ ...inp, minWidth: 220 }} placeholder="目標資料夾" value={r.action.target || ''} onChange={(e) => updateAct(r.id, { target: e.target.value })} />
                        <Button size="sm" icon="📁" onClick={() => pickFolder(r.id, 'action')} />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}

      <Dialog
        open={!!confirmId}
        title="刪除規則"
        message="確定要刪除這條自動化規則嗎？"
        confirmLabel="刪除"
        danger
        onConfirm={() => removeRule(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
