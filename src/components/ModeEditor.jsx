import React, { useEffect, useState } from 'react';
import ActionButton from './ActionButton.jsx';

const inp = {
  background: '#0b1220',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
};
const pathInp = { ...inp, flex: 1, minWidth: 200, fontFamily: '"Cascadia Code","Consolas",monospace' };

// --- shape helpers (mirror modeService normalization) ----------------------
function normApp(a) {
  if (typeof a === 'string') return { path: a, name: '', icon: '' };
  if (a && typeof a === 'object') return { path: a.path || '', name: a.name || '', icon: a.icon || '' };
  return { path: '', name: '', icon: '' };
}
function denormApp(a) {
  const path = (a.path || '').trim();
  if (a.name || a.icon) return { path, name: a.name || '', icon: a.icon || '' };
  return path; // keep config tidy when no name/icon
}
function normMode(m) {
  return {
    name: m.name || '',
    apps: (m.apps || []).map(normApp),
    folders: [...(m.folders || [])],
    urls: [...(m.urls || [])],
    commands: (m.commands || []).map((c) => ({ cwd: c.cwd || '', command: c.command || '' })),
  };
}

export default function ModeEditor({ onSaved }) {
  const [modes, setModes] = useState([]);
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!window.api) {
      setToast({ type: 'error', msg: '無法連接 Electron 主程序。' });
      setLoading(false);
      return;
    }
    const res = await window.api.getSettings();
    setModes((res.settings.modes || []).map(normMode));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const mode = modes[selected];

  const updateMode = (patch) => {
    setModes((prev) => prev.map((m, i) => (i === selected ? { ...m, ...patch } : m)));
  };

  // generic list helpers
  const addApp = () => updateMode({ apps: [...mode.apps, { path: '', name: '', icon: '' }] });
  const setApp = (i, patch) =>
    updateMode({ apps: mode.apps.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) });
  const removeApp = (i) => updateMode({ apps: mode.apps.filter((_, idx) => idx !== i) });

  const addStr = (key) => updateMode({ [key]: [...mode[key], ''] });
  const setStr = (key, i, v) => updateMode({ [key]: mode[key].map((s, idx) => (idx === i ? v : s)) });
  const removeStr = (key, i) => updateMode({ [key]: mode[key].filter((_, idx) => idx !== i) });

  const addCmd = () => updateMode({ commands: [...mode.commands, { cwd: '', command: '' }] });
  const setCmd = (i, patch) =>
    updateMode({ commands: mode.commands.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  const removeCmd = (i) => updateMode({ commands: mode.commands.filter((_, idx) => idx !== i) });

  const addMode = () => {
    setModes((prev) => [...prev, { name: '新模式', apps: [], folders: [], urls: [], commands: [] }]);
    setSelected(modes.length);
  };
  const deleteMode = () => {
    setModes((prev) => prev.filter((_, i) => i !== selected));
    setSelected(0);
  };

  const save = async () => {
    const res = await window.api.getSettings();
    const cleaned = modes
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        apps: m.apps.filter((a) => (a.path || '').trim()).map(denormApp),
        folders: m.folders.map((s) => s.trim()).filter(Boolean),
        urls: m.urls.map((s) => s.trim()).filter(Boolean),
        commands: m.commands.filter((c) => (c.command || '').trim()),
      }));
    const next = { ...res.settings, modes: cleaned };
    const r = await window.api.saveSettings(next);
    if (r.ok) {
      setToast({ type: 'ok', msg: '工作模式已儲存。' });
      if (onSaved) onSaved();
    } else {
      setToast({ type: 'error', msg: r.error || '儲存失敗' });
    }
  };

  if (loading) {
    return (
      <div className="card">
        <span className="spinner" /> 載入中…
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="row-between">
        <div className="section-title" style={{ margin: 0 }}>編輯工作模式</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ActionButton icon="➕" onClick={addMode}>新增模式</ActionButton>
          <ActionButton variant="primary" icon="💾" onClick={save}>儲存全部</ActionButton>
        </div>
      </div>

      {modes.length === 0 ? (
        <p className="muted">目前沒有模式，按「新增模式」開始。</p>
      ) : (
        <>
          {/* mode tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
            {modes.map((m, i) => (
              <button
                key={i}
                className={`action-btn ${i === selected ? 'primary' : 'ghost'}`}
                onClick={() => setSelected(i)}
                style={{ padding: '6px 12px' }}
              >
                {m.name || '(未命名)'}
              </button>
            ))}
          </div>

          {mode ? (
            <div>
              <label className="muted" style={{ fontSize: 12 }}>模式名稱</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 16 }}>
                <input
                  style={{ ...inp, flex: 1 }}
                  value={mode.name}
                  onChange={(e) => updateMode({ name: e.target.value })}
                />
                <ActionButton variant="ghost" icon="🗑️" onClick={deleteMode}>刪除此模式</ActionButton>
              </div>

              {/* Apps */}
              <div className="section-title" style={{ fontSize: 14 }}>應用程式（可設定圖示與友善名稱）</div>
              {mode.apps.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <input style={{ ...inp, width: 50, textAlign: 'center' }} placeholder="🧩" value={a.icon} onChange={(e) => setApp(i, { icon: e.target.value })} />
                  <input style={{ ...inp, width: 130 }} placeholder="名稱 (VS Code)" value={a.name} onChange={(e) => setApp(i, { name: e.target.value })} />
                  <input style={pathInp} placeholder="C:\\...\\Code.exe" value={a.path} onChange={(e) => setApp(i, { path: e.target.value })} />
                  <button className="action-btn ghost" style={{ padding: '6px 10px' }} onClick={() => removeApp(i)}>✕</button>
                </div>
              ))}
              <ActionButton variant="ghost" icon="➕" onClick={addApp}>新增應用程式</ActionButton>

              {/* Folders */}
              <div className="section-title" style={{ fontSize: 14, marginTop: 16 }}>資料夾</div>
              {mode.folders.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input style={pathInp} placeholder="D:\\Projects\\..." value={f} onChange={(e) => setStr('folders', i, e.target.value)} />
                  <button className="action-btn ghost" style={{ padding: '6px 10px' }} onClick={() => removeStr('folders', i)}>✕</button>
                </div>
              ))}
              <ActionButton variant="ghost" icon="➕" onClick={() => addStr('folders')}>新增資料夾</ActionButton>

              {/* URLs */}
              <div className="section-title" style={{ fontSize: 14, marginTop: 16 }}>網址（請勿放 localhost:5173）</div>
              {mode.urls.map((u, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input style={pathInp} placeholder="https://github.com/..." value={u} onChange={(e) => setStr('urls', i, e.target.value)} />
                  <button className="action-btn ghost" style={{ padding: '6px 10px' }} onClick={() => removeStr('urls', i)}>✕</button>
                </div>
              ))}
              <ActionButton variant="ghost" icon="➕" onClick={() => addStr('urls')}>新增網址</ActionButton>

              {/* Commands */}
              <div className="section-title" style={{ fontSize: 14, marginTop: 16 }}>指令</div>
              {mode.commands.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <input style={{ ...inp, width: 220, fontFamily: '"Cascadia Code","Consolas",monospace' }} placeholder="cwd (工作目錄)" value={c.cwd} onChange={(e) => setCmd(i, { cwd: e.target.value })} />
                  <input style={pathInp} placeholder="npm run dev" value={c.command} onChange={(e) => setCmd(i, { command: e.target.value })} />
                  <button className="action-btn ghost" style={{ padding: '6px 10px' }} onClick={() => removeCmd(i)}>✕</button>
                </div>
              ))}
              <ActionButton variant="ghost" icon="➕" onClick={addCmd}>新增指令</ActionButton>
            </div>
          ) : null}
        </>
      )}

      {toast ? <div className={`toast ${toast.type}`} style={{ marginTop: 14 }}>{toast.msg}</div> : null}
    </div>
  );
}
