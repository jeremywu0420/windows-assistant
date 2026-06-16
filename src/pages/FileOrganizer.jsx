import React, { useEffect, useState } from 'react';
import ActionButton from '../components/ActionButton.jsx';
import Dialog from '../components/Dialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useToast } from '../components/Toast.jsx';

export default function FileOrganizer() {
  const { toast } = useToast();
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [moveResult, setMoveResult] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [askBefore, setAskBefore] = useState(true);

  useEffect(() => {
    (async () => {
      if (!window.api) return;
      const res = await window.api.getSettings();
      setAskBefore(!(res.settings.general && res.settings.general.askBeforeOrganizing === false));
    })();
  }, []);

  const doScan = async () => {
    if (!window.api) { setError('無法連接 Electron 主程序。'); return; }
    setScanning(true);
    setMoveResult(null);
    setError('');
    const res = await window.api.scanDownloads();
    if (!res.ok) { setError(res.error || '掃描失敗'); setScan(null); }
    else setScan(res);
    setScanning(false);
  };

  const persistDownloadsPath = async (p) => {
    const res = await window.api.getSettings();
    await window.api.saveSettings({ ...res.settings, general: { ...(res.settings.general || {}), downloadsPath: p } });
  };

  const autoDetect = async () => {
    setDetecting(true);
    setError('');
    const r = await window.api.detectDownloads();
    setDetecting(false);
    if (r.ok) { await persistDownloadsPath(r.path); toast(`已偵測：${r.path}`, 'ok'); await doScan(); }
    else setError(r.error || '自動偵測失敗，請改用「選擇資料夾」。');
  };

  const pickFolder = async () => {
    setError('');
    const r = await window.api.pickPath({ type: 'folder', title: '選擇 Downloads 資料夾' });
    if (r.canceled) return;
    if (r.ok) { await persistDownloadsPath(r.path); toast(`已設定：${r.path}`, 'ok'); await doScan(); }
    else setError(r.error || '選擇資料夾失敗');
  };

  const openFolder = async () => {
    const r = await window.api.openDownloadsFolder();
    if (!r.ok) toast(r.error || '開啟失敗', 'error');
  };

  const performOrganize = async () => {
    setConfirmOpen(false);
    if (!scan || !scan.items || scan.items.length === 0) return;
    setOrganizing(true);
    const res = await window.api.organizeFiles(scan.items);
    setMoveResult(res);
    setCanUndo(res.moved > 0);
    setOrganizing(false);
    toast(`整理完成：成功 ${res.moved}、失敗 ${res.failed}`, res.failed === 0 ? 'ok' : 'warn');
    const fresh = await window.api.scanDownloads();
    if (fresh.ok) setScan(fresh);
  };

  const onOrganizeClick = () => {
    if (!scan || !scan.items || scan.items.length === 0) return;
    if (askBefore) setConfirmOpen(true);
    else performOrganize();
  };

  const doUndo = async () => {
    setUndoing(true);
    const r = await window.api.undoOrganize();
    setUndoing(false);
    if (r.ok) { toast(`已復原 ${r.restored} 個檔案`, 'ok'); setCanUndo(false); await doScan(); }
    else toast(r.error || '復原失敗', 'error');
  };

  return (
    <div>
      <h1 className="page-title">Downloads 整理</h1>
      <p className="page-subtitle">
        先預覽，確認後才會移動檔案。<strong>不會刪除任何檔案</strong>，重名自動加編號，並可復原上一次整理。
      </p>

      {error ? <div className="error-banner">⚠️ {error}</div> : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          目前要整理的資料夾：
          <span className="path">{scan ? scan.downloadsPath : '（按「掃描」或「自動偵測」）'}</span>
        </div>
        <div className="button-row" style={{ marginTop: 10, marginBottom: 0 }}>
          <ActionButton icon="🧭" busy={detecting} onClick={autoDetect}>自動偵測路徑</ActionButton>
          <ActionButton icon="📁" onClick={pickFolder}>選擇資料夾</ActionButton>
          <ActionButton icon="📂" onClick={openFolder}>開啟資料夾</ActionButton>
        </div>
      </div>

      <div className="button-row">
        <ActionButton variant="primary" icon="🔍" busy={scanning} onClick={doScan}>掃描 Downloads</ActionButton>
        <ActionButton icon="📦" busy={organizing} disabled={!scan || !scan.items || scan.items.length === 0} onClick={onOrganizeClick}>
          確認並整理 {scan && scan.items ? `(${scan.items.length})` : ''}
        </ActionButton>
        <ActionButton icon="↩️" busy={undoing} disabled={!canUndo} onClick={doUndo}>復原上一次整理</ActionButton>
      </div>

      {scan ? (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="row-between">
            <div className="section-title">預覽（共 {scan.totalFiles} 個檔案）</div>
            <span className="muted path">{scan.downloadsPath}</span>
          </div>
          <div style={{ marginBottom: 10 }}>
            {Object.entries(scan.byCategory).map(([cat, n]) => (
              <span className="tag" key={cat} style={{ marginRight: 6 }}>{cat}: {n}</span>
            ))}
          </div>
          {scan.items.length === 0 ? (
            <EmptyState icon="✨" title="沒有需要整理的檔案" description="Downloads 根目錄是乾淨的。" />
          ) : (
            <table className="table">
              <thead><tr><th>檔案</th><th>副檔名</th><th>分類到</th></tr></thead>
              <tbody>
                {scan.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td><span className="tag">{item.ext}</span></td>
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
            <span className={`badge ${moveResult.failed === 0 ? 'ok' : 'warn'}`}>成功 {moveResult.moved} · 失敗 {moveResult.failed}</span>
          </div>
          <table className="table">
            <thead><tr><th>檔案</th><th>結果</th><th>位置 / 錯誤</th></tr></thead>
            <tbody>
              {moveResult.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td className={r.status === 'moved' ? 'status-ok' : 'status-error'}>{r.status === 'moved' ? '✅ 已移動' : '❌ 失敗'}</td>
                  <td className="path">{r.status === 'moved' ? r.to : r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        open={confirmOpen}
        title="確認整理"
        message={`將移動 ${scan && scan.items ? scan.items.length : 0} 個檔案到分類子資料夾（不會刪除，重名會加編號）。要繼續嗎？`}
        confirmLabel="開始整理"
        onConfirm={performOrganize}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
