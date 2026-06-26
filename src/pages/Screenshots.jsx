import React, { useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Screenshots() {
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [moveResult, setMoveResult] = useState(null);
  const [error, setError] = useState('');

  const doScan = async () => {
    if (!window.api) {
      setError('Electron API 尚未就緒，請在桌面 App 內使用。');
      return;
    }

    setScanning(true);
    setMoveResult(null);
    setError('');
    const res = await window.api.scanScreenshots();
    if (res.ok) {
      setScan(res);
    } else {
      setError(res.error || '掃描截圖失敗');
      setScan(null);
    }
    setScanning(false);
  };

  const doOrganize = async () => {
    if (!scan?.items?.length) return;
    setOrganizing(true);
    const res = await window.api.organizeScreenshots(scan.items);
    setMoveResult(res);
    setOrganizing(false);

    const fresh = await window.api.scanScreenshots();
    if (fresh.ok) setScan(fresh);
  };

  const categories = Object.entries(scan?.byCategory || {});

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">SCREENSHOT SORTER</p>
          <h1 className="page-title">截圖整理</h1>
          <p className="page-subtitle">
            掃描截圖資料夾中的圖片，依關鍵字整理到 Code、Circuit、Report、School、Other 等分類。
          </p>
        </div>
        <div className="head-actions">
          <Button icon="SC" variant="primary" busy={scanning} onClick={doScan}>
            掃描截圖
          </Button>
          <Button icon="MV" busy={organizing} disabled={!scan?.items?.length} onClick={doOrganize}>
            整理 {scan?.items?.length ? `(${scan.items.length})` : ''}
          </Button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <Card className="control-panel">
        <div>
          <div className="panel-label">來源資料夾</div>
          <div className="path">{scan?.screenshotsPath || '~/Pictures/Screenshots'}</div>
        </div>
        <div className="chip-row">
          {categories.length > 0 ? (
            categories.map(([category, count]) => (
              <span className="tag" key={category}>
                {category}: {count}
              </span>
            ))
          ) : (
            <span className="muted">尚未掃描</span>
          )}
        </div>
      </Card>

      {scan ? (
        <Card>
          <div className="row-between">
            <div>
              <div className="section-title">掃描結果</div>
              <p className="muted">共找到 {scan.totalFiles} 個圖片檔案。</p>
            </div>
            <StatusBadge tone={scan.items.length ? 'warn' : 'ok'}>
              {scan.items.length ? `${scan.items.length} 個待整理` : '已整理'}
            </StatusBadge>
          </div>

          {scan.items.length === 0 ? (
            <EmptyState title="目前沒有需要整理的截圖" description="資料夾看起來很乾淨。" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>檔名</th>
                  <th>分類</th>
                </tr>
              </thead>
              <tbody>
                {scan.items.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td>{item.name}</td>
                    <td>
                      <span className="tag">{item.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}

      {moveResult ? (
        <Card>
          <div className="row-between">
            <div className="section-title">整理結果</div>
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
              {(moveResult.results || []).map((result, index) => (
                <tr key={`${result.name}-${index}`}>
                  <td>{result.name}</td>
                  <td className={result.status === 'moved' ? 'status-ok' : 'status-error'}>
                    {result.status === 'moved' ? '已移動' : '失敗'}
                  </td>
                  <td className="path">{result.status === 'moved' ? result.to : result.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
