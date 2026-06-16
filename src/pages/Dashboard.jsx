import React, { useCallback, useEffect, useState } from 'react';
import StatusCard from '../components/StatusCard.jsx';
import Card from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import AlertList from '../components/AlertList.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatGB, formatUptime, usageLevel } from '../utils/format.js';

function buildAlerts(status) {
  const alerts = [];
  if (!status) return alerts;
  const ruleAlerts = (status.rules && status.rules.alerts) || [];
  for (const a of ruleAlerts) alerts.push({ level: a.level || 'warn', title: a.title, desc: a.desc });
  const projects = (status.git && status.git.projects) || [];
  for (const p of projects) {
    if (p.error) alerts.push({ level: 'info', title: `${p.name}：${p.error}`, desc: p.path });
    else if (p.modifiedCount > 0) alerts.push({ level: 'warn', title: `${p.name} 有 ${p.modifiedCount} 個檔案尚未 commit`, desc: p.messages.join('；') });
  }
  return alerts;
}

export default function Dashboard({ onNavigate }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!window.api) { setError('無法連接 Electron 主程序（請在桌面 App 內執行）。'); setLoading(false); return; }
    const [res, mon, settings] = await Promise.all([
      window.api.getSystemStatus(),
      window.api.getMonitorState(),
      window.api.getSettings(),
    ]);
    if (res.ok) { setStatus(res); setError(''); } else setError(res.error || '讀取系統狀態失敗');
    if (mon && mon.ok) setMonitor(mon);
    setHistory((settings.settings && settings.settings.history) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    const off = window.api ? window.api.onMonitoringChanged(() => refresh()) : null;
    return () => { clearInterval(id); off && off(); };
  }, [refresh]);

  const organize = () => onNavigate('files');
  const openDownloads = async () => {
    const r = await window.api.openDownloadsFolder();
    toast(r.ok ? '已開啟 Downloads' : r.error || '開啟失敗', r.ok ? 'ok' : 'error');
  };
  const toggleMonitor = async () => {
    const r = await window.api.setMonitorPaused(!(monitor && monitor.paused));
    toast(r.paused ? '已暫停監控' : '已恢復監控', 'ok');
    refresh();
  };

  const metrics = status && status.metrics;
  const health = status && status.health;
  const disks = (metrics && metrics.disks) || [];
  const firstDisk = disks.find((d) => d.ok);
  const paused = monitor && monitor.paused;

  return (
    <div>
      <div className="row-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">今日狀態摘要 {loading ? <span className="spinner" /> : null}</p>
        </div>
        {health ? (
          <StatusBadge tone={health.score >= 80 ? 'ok' : health.score >= 60 ? 'warn' : 'danger'}>
            Health {health.score}/100 · {health.status}
          </StatusBadge>
        ) : null}
      </div>

      {error ? <div className="error-banner">⚠️ {error}</div> : null}

      {/* Status cards */}
      <div className="card-grid">
        <StatusCard label="App 狀態" icon="🟢" value="運作中" sub={paused ? '監控已暫停' : '監控運作中'} />
        <StatusCard label="Downloads 未分類" icon="🗂️"
          value={status && status.downloads.ok ? `${status.downloads.count}` : '—'}
          sub={status && status.downloads.ok ? '個檔案待整理' : '無法讀取'} />
        <StatusCard label="監控資料夾" icon="👁️" value={monitor ? `${monitor.watched}` : '—'}
          sub={monitor ? (monitor.enabled ? (paused ? '已暫停' : '監控中') : '已停用') : ''} />
        <StatusCard label="CPU" icon="🧠" value={metrics ? `${metrics.cpu.usagePercent}%` : '—'}
          barPercent={metrics ? metrics.cpu.usagePercent : 0} barLevel={metrics ? usageLevel(metrics.cpu.usagePercent) : 'ok'} />
        <StatusCard label="RAM" icon="💾" value={metrics ? `${metrics.memory.usagePercent}%` : '—'}
          barPercent={metrics ? metrics.memory.usagePercent : 0} barLevel={metrics ? usageLevel(metrics.memory.usagePercent) : 'ok'} />
        <StatusCard label="磁碟剩餘" icon="🗄️" value={firstDisk ? formatGB(firstDisk.free) : '—'}
          sub={firstDisk ? `${firstDisk.drive} 剩餘 ${firstDisk.freePercent}%` : '—'}
          barPercent={firstDisk ? firstDisk.usedPercent : 0} barLevel={firstDisk && firstDisk.freePercent < 20 ? 'danger' : 'ok'} />
      </div>

      {/* Quick actions */}
      <div className="section-title">快速操作</div>
      <div className="quick-grid" style={{ marginBottom: 22 }}>
        <button className="quick-action" onClick={organize}><span className="qa-icon">📦</span><span className="qa-label">一鍵整理 Downloads</span></button>
        <button className="quick-action" onClick={openDownloads}><span className="qa-icon">📂</span><span className="qa-label">開啟 Downloads</span></button>
        <button className="quick-action" onClick={() => onNavigate('automations')}><span className="qa-icon">⚡</span><span className="qa-label">新增自動化規則</span></button>
        <button className="quick-action" onClick={toggleMonitor}><span className="qa-icon">{paused ? '▶️' : '⏸️'}</span><span className="qa-label">{paused ? '啟用監控' : '暫停監控'}</span></button>
        <button className="quick-action" onClick={() => onNavigate('settings')}><span className="qa-icon">⚙️</span><span className="qa-label">開啟設定</span></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Card title="最近整理紀錄" icon="🕘">
          {history.length === 0 ? (
            <EmptyState icon="🗂️" title="尚無整理紀錄" description="整理一次 Downloads 後會顯示在這裡。" />
          ) : (
            <table className="table">
              <thead><tr><th>時間</th><th>結果</th><th>檔案</th></tr></thead>
              <tbody>
                {history.slice(0, 6).map((h, i) => (
                  <tr key={i}>
                    <td className="muted">{new Date(h.at).toLocaleString()}</td>
                    <td>成功 {h.moved}{h.failed ? ` · 失敗 ${h.failed}` : ''}</td>
                    <td className="muted">{(h.sample || []).join('、') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="提醒" icon="🔔">
          <AlertList alerts={buildAlerts(status)} />
        </Card>
      </div>
    </div>
  );
}
