import React, { useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Dialog from '../components/Dialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
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
      const result = await window.api.getSettings();
      setAskBefore(
        !(result.settings.general && result.settings.general.askBeforeOrganizing === false),
      );
    })();
  }, []);

  const categoryRows = useMemo(() => Object.entries(scan?.byCategory || {}), [scan]);

  const persistDownloadsPath = async (folder) => {
    const result = await window.api.getSettings();
    await window.api.saveSettings({
      ...result.settings,
      general: { ...(result.settings.general || {}), downloadsPath: folder },
    });
  };

  const doScan = async () => {
    if (!window.api) {
      setError('Electron API 尚未就緒，請在桌面 App 內使用。');
      return;
    }

    setScanning(true);
    setMoveResult(null);
    setError('');
    const result = await window.api.scanDownloads();
    if (result.ok) {
      setScan(result);
    } else {
      setScan(null);
      setError(result.error || '掃描 Downloads 失敗');
    }
    setScanning(false);
  };

  const autoDetect = async () => {
    setDetecting(true);
    setError('');
    const result = await window.api.detectDownloads();
    setDetecting(false);
    if (result.ok) {
      await persistDownloadsPath(result.path);
      toast(`已設定 Downloads: ${result.path}`, 'ok');
      await doScan();
    } else {
      setError(result.error || '找不到 Downloads 資料夾');
    }
  };

  const pickFolder = async () => {
    setError('');
    const result = await window.api.pickPath({ type: 'folder', title: '選擇 Downloads 資料夾' });
    if (result.canceled) return;
    if (result.ok) {
      await persistDownloadsPath(result.path);
      toast(`已更新資料夾: ${result.path}`, 'ok');
      await doScan();
    } else {
      setError(result.error || '選擇資料夾失敗');
    }
  };

  const openFolder = async () => {
    const result = await window.api.openDownloadsFolder();
    if (!result.ok) toast(result.error || '無法開啟資料夾', 'error');
  };

  const performOrganize = async () => {
    setConfirmOpen(false);
    if (!scan?.items?.length) return;

    setOrganizing(true);
    const result = await window.api.organizeFiles(scan.items);
    setMoveResult(result);
    setCanUndo(result.moved > 0);
    setOrganizing(false);
    toast(
      `整理完成：成功 ${result.moved}，失敗 ${result.failed}`,
      result.failed === 0 ? 'ok' : 'warn',
    );

    const fresh = await window.api.scanDownloads();
    if (fresh.ok) setScan(fresh);
  };

  const onOrganizeClick = () => {
    if (!scan?.items?.length) return;
    if (askBefore) setConfirmOpen(true);
    else performOrganize();
  };

  const doUndo = async () => {
    setUndoing(true);
    const result = await window.api.undoOrganize();
    setUndoing(false);
    if (result.ok) {
      toast(`已還原 ${result.restored} 個檔案`, 'ok');
      setCanUndo(false);
      await doScan();
    } else {
      toast(result.error || '還原失敗', 'error');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">FILES</p>
          <h1 className="page-title">檔案整理</h1>
          <p className="page-subtitle">
            掃描 Downloads，依檔案類型與分類規則移動到對應資料夾，並保留一次還原機會。
          </p>
        </div>
        <div className="head-actions">
          <StatusBadge tone={scan?.items?.length ? 'warn' : 'muted'}>
            {scan ? `${scan.items.length} 個待整理` : '尚未掃描'}
          </StatusBadge>
          <Button variant="primary" icon="SC" busy={scanning} onClick={doScan}>
            掃描
          </Button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <Card className="control-panel">
        <div>
          <div className="panel-label">目前資料夾</div>
          <div className="path">{scan?.downloadsPath || '尚未掃描'}</div>
        </div>
        <div className="head-actions">
          <Button size="sm" icon="AU" busy={detecting} onClick={autoDetect}>
            自動偵測
          </Button>
          <Button size="sm" icon="PK" onClick={pickFolder}>
            選擇
          </Button>
          <Button size="sm" icon="OP" onClick={openFolder}>
            開啟
          </Button>
        </div>
      </Card>

      <div className="head-actions" style={{ justifyContent: 'flex-start', marginBottom: 16 }}>
        <Button
          variant="primary"
          icon="MV"
          busy={organizing}
          disabled={!scan?.items?.length}
          onClick={onOrganizeClick}
        >
          整理檔案 {scan?.items?.length ? `(${scan.items.length})` : ''}
        </Button>
        <Button icon="UN" busy={undoing} disabled={!canUndo} onClick={doUndo}>
          還原上次整理
        </Button>
      </div>

      {scan ? (
        <Card title={`掃描結果：${scan.totalFiles} 個檔案`} icon="SC" style={{ marginBottom: 16 }}>
          {categoryRows.length ? (
            <div className="chip-row">
              {categoryRows.map(([category, count]) => (
                <span className="tag" key={category}>
                  {category}: {count}
                </span>
              ))}
            </div>
          ) : null}

          {scan.items.length === 0 ? (
            <EmptyState title="沒有需要整理的檔案" description="Downloads 目前看起來很乾淨。" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>檔名</th>
                  <th>副檔名</th>
                  <th>分類</th>
                </tr>
              </thead>
              <tbody>
                {scan.items.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td>{item.name}</td>
                    <td>
                      <span className="tag">{item.ext}</span>
                    </td>
                    <td className="muted">{item.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}

      {moveResult ? (
        <Card title="整理結果" icon="RS">
          <div className="result-strip">
            <StatusBadge tone={moveResult.failed === 0 ? 'ok' : 'warn'}>
              成功 {moveResult.moved}，失敗 {moveResult.failed}
            </StatusBadge>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>檔名</th>
                <th>狀態</th>
                <th>目的地 / 錯誤</th>
              </tr>
            </thead>
            <tbody>
              {(moveResult.results || []).map((row, index) => (
                <tr key={`${row.name}-${index}`}>
                  <td>{row.name}</td>
                  <td className={row.status === 'moved' ? 'status-ok' : 'status-error'}>
                    {row.status === 'moved' ? '已移動' : '失敗'}
                  </td>
                  <td className="path">{row.status === 'moved' ? row.to : row.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Dialog
        open={confirmOpen}
        title="整理檔案"
        message={`即將整理 ${scan?.items?.length || 0} 個檔案，檔案會移動到分類資料夾。`}
        confirmLabel="開始整理"
        onConfirm={performOrganize}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
