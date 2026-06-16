import React, { useState } from 'react';
import ActionButton from '../components/ActionButton.jsx';

export default function FileOrganizer() {
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [moveResult, setMoveResult] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const doScan = async () => {
    if (!window.api) {
      setError('無法連接 Electron 主程序。');
      return;
    }
    setScanning(true);
    setMoveResult(null);
    setError('');
    const res = await window.api.scanDownloads();
    if (!res.ok) {
      setError(res.error || '掃描失敗');
      setScan(null);
    } else {
      setScan(res);
    }
    setScanning(false);
  };

  // Persist only general.downloadsPath without disturbing the rest of the config.
  const persistDownloadsPath = async (p) => {
    const res = await window.api.getSettings();
    const next = { ...res.settings, general: { ...(res.settings.general || {}), downloadsPath: p } };
    await window.api.saveSettings(next);
  };

  const autoDetect = async () => {
    setDetecting(true);
    setError('');
    setInfo('');
    const r = await window.api.detectDownloads();
    setDetecting(false);
    if (r.ok) {
      await persistDownloadsPath(r.path);
      setInfo(`已自動偵測 Downloads 路徑：${r.path}`);
      await doScan();
    } else {
      setError(r.error || '自動偵測失敗，請改用「選擇資料夾」。');
    }
  };

  const pickFolder = async () => {
    setError('');
    setInfo('');
    const r = await window.api.pickPath({ type: 'folder', title: '選擇 Downloads 資料夾' });
    if (r.canceled) return;
    if (r.ok) {
      await persistDownloadsPath(r.path);
      setInfo(`已設定 Downloads 路徑：${r.path}`);
      await doScan();
    } else {
      setError(r.error || '選擇資料夾失敗');
    }
  };

  const doOrganize = async () => {
    if (!scan || !scan.items || scan.items.length === 0) return;
    setOrganizing(true);
    const res = await window.api.organizeFiles(scan.items);
    setMoveResult(res);
    setOrganizing(false);
    // Re-scan so the preview reflects the new state.
    const fresh = await window.api.scanDownloads();
    if (fresh.ok) setScan(fresh);
  };

  return (
    <div>
      <h1 className="page-title">整理 Downloads</h1>
      <p className="page-subtitle">
        先預覽（preview），確認後才會移動檔案。<strong>不會刪除任何檔案</strong>，重名會自動加上編號。
      </p>

      {error ? <div className="error-banner">⚠️ {error}</div> : null}
      {info ? <div className="toast ok" style={{ marginBottom: 12 }}>{info}</div> : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          目前要整理的資料夾：
          <span className="path">{scan ? scan.downloadsPath : '（按「掃描」或「自動偵測」）'}</span>
        </div>
        <div className="button-row" style={{ marginTop: 10, marginBottom: 0 }}>
          <ActionButton icon="🧭" busy={detecting} onClick={autoDetect}>
            自動偵測路徑
          </ActionButton>
          <ActionButton icon="📁" onClick={pickFolder}>
            選擇資料夾
          </ActionButton>
        </div>
      </div>

      <div className="button-row">
        <ActionButton variant="primary" icon="🔍" busy={scanning} onClick={doScan}>
          掃描 Downloads
        </ActionButton>
        <ActionButton
          icon="📦"
          busy={organizing}
          disabled={!scan || !scan.items || scan.items.length === 0}
          onClick={doOrganize}
        >
          確認並整理 {scan && scan.items ? `(${scan.items.length})` : ''}
        </ActionButton>
      </div>

      {scan ? (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="row-between">
            <div className="section-title">預覽（共 {scan.totalFiles} 個檔案）</div>
            <span className="muted path">{scan.downloadsPath}</span>
          </div>
          <div style={{ marginBottom: 10 }}>
            {Object.entries(scan.byCategory).map(([cat, n]) => (
              <span className="tag" key={cat} style={{ marginRight: 6 }}>
                {cat}: {n}
              </span>
            ))}
          </div>
          {scan.items.length === 0 ? (
            <p className="muted">Downloads 根目錄沒有需要整理的檔案 🎉</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>檔案</th>
                  <th>副檔名</th>
                  <th>分類到</th>
                </tr>
              </thead>
              <tbody>
                {scan.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td>
                      <span className="tag">{item.ext}</span>
                    </td>
                    <td className="muted">→ {item.category}/</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {moveResult ? (
        <div className="card">
          <div className="row-between">
            <div className="section-title">整理結果</div>
            <span className={`badge ${moveResult.failed === 0 ? 'ok' : 'warn'}`}>
              成功 {moveResult.moved} · 失敗 {moveResult.failed}
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>檔案</th>
                <th>結果</th>
                <th>位置 / 錯誤</th>
              </tr>
            </thead>
            <tbody>
              {moveResult.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td className={r.status === 'moved' ? 'status-ok' : 'status-error'}>
                    {r.status === 'moved' ? '✅ 已移動' : '❌ 失敗'}
                  </td>
                  <td className="path">{r.status === 'moved' ? r.to : r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
