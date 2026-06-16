import React, { useCallback, useEffect, useState } from 'react';
import ActionButton from '../components/ActionButton.jsx';
import ModeEditor from '../components/ModeEditor.jsx';

const STEP_LABEL = { app: '應用程式', folder: '資料夾', url: '網址', command: '指令' };

export default function Modes({ externalResult }) {
  const [modes, setModes] = useState([]);
  const [busyMode, setBusyMode] = useState(null);
  const [result, setResult] = useState(externalResult || null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (externalResult) setResult(externalResult);
  }, [externalResult]);

  const loadModes = useCallback(async () => {
    if (!window.api) {
      setError('無法連接 Electron 主程序。');
      return;
    }
    const res = await window.api.listModes();
    setModes(res.modes || []);
  }, []);

  useEffect(() => {
    loadModes();
  }, [loadModes]);

  const run = async (name) => {
    setBusyMode(name);
    setResult(null);
    const res = await window.api.runMode(name);
    setResult(res);
    setBusyMode(null);
  };

  return (
    <div>
      <div className="row-between">
        <div>
          <h1 className="page-title">工作模式</h1>
          <p className="page-subtitle">一鍵啟動：開啟 App、資料夾、網址，並執行指令。</p>
        </div>
        <ActionButton
          variant={editing ? 'primary' : 'ghost'}
          icon={editing ? '✅' : '✏️'}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? '完成編輯' : '編輯模式'}
        </ActionButton>
      </div>

      {error ? <div className="error-banner">⚠️ {error}</div> : null}

      {editing ? (
        <ModeEditor
          onSaved={() => {
            loadModes();
          }}
        />
      ) : null}

      {modes.length === 0 ? (
        <div className="card">
          <p className="muted">尚未設定任何工作模式。請到「設定」頁面新增 modes。</p>
        </div>
      ) : (
        <div className="card-grid">
          {modes.map((m) => (
            <div className="card" key={m.name}>
              <div className="section-title">{m.name}</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                {m.apps.length} 個 App · {m.folders.length} 個資料夾 · {m.urls.length} 個網址 ·{' '}
                {m.commands.length} 個指令
              </div>
              <ActionButton
                variant="primary"
                icon="🚀"
                busy={busyMode === m.name}
                onClick={() => run(m.name)}
              >
                啟動
              </ActionButton>
            </div>
          ))}
        </div>
      )}

      {result ? (
        <div className="card">
          <div className="row-between">
            <div className="section-title">執行結果：{result.mode}</div>
            <span className={`badge ${result.ok ? 'ok' : 'warn'}`}>
              {result.ok ? '全部成功' : '部分失敗'}
            </span>
          </div>
          {result.error ? <div className="error-banner">⚠️ {result.error}</div> : null}
          {result.steps && result.steps.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>類型</th>
                  <th>目標</th>
                  <th>狀態</th>
                  <th>訊息</th>
                </tr>
              </thead>
              <tbody>
                {result.steps.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <span className="tag">{STEP_LABEL[s.type] || s.type}</span>
                    </td>
                    <td className="path">{s.target}</td>
                    <td className={s.status === 'ok' ? 'status-ok' : s.status === 'skipped' ? 'muted' : 'status-error'}>
                      {s.status === 'ok' ? '✅ OK' : s.status === 'skipped' ? '⏭️ 略過' : '❌ 失敗'}
                    </td>
                    <td className="muted">{s.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
