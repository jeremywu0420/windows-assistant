import React, { useCallback, useEffect, useState } from 'react';
import StatusCard from '../components/StatusCard.jsx';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import { formatGB, formatUptime, usageLevel } from '../utils/format.js';

export default function SystemMonitor() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!window.api) { setError('無法連接 Electron 主程序。'); setLoading(false); return; }
    const res = await window.api.getSystemStatus();
    if (res.ok) { setStatus(res); setError(''); } else setError(res.error || '讀取失敗');
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const m = status && status.metrics;
  const health = status && status.health;

  return (
    <div>
      <div className="row-between">
        <div>
          <h1 className="page-title">System Monitor</h1>
          <p className="page-subtitle">CPU / RAM / 磁碟 / 開機時間，每 4 秒更新。</p>
        </div>
        <Button icon="🔄" busy={loading} onClick={refresh}>重新整理</Button>
      </div>

      {error ? <div className="error-banner">⚠️ {error}</div> : null}

      {health ? (
        <Card style={{ marginBottom: 18 }}>
          <div className="health-hero" style={{ margin: 0 }}>
            <div>
              <div className="muted">PC Health Score</div>
              <div className="health-score">{health.score} <small>/ 100</small></div>
            </div>
            <span className={`badge ${health.score >= 80 ? 'ok' : health.score >= 60 ? 'warn' : 'danger'}`}>
              {health.status}
            </span>
          </div>
        </Card>
      ) : null}

      <div className="card-grid">
        <StatusCard label="CPU" icon="🧠" value={m ? `${m.cpu.usagePercent}%` : '—'}
          sub={m ? `${m.cpu.cores} 核心${m.cpu.sustainedHigh ? ' · 持續偏高' : ''}` : ''}
          barPercent={m ? m.cpu.usagePercent : 0} barLevel={m ? usageLevel(m.cpu.usagePercent) : 'ok'} />
        <StatusCard label="RAM" icon="💾" value={m ? `${m.memory.usagePercent}%` : '—'}
          sub={m ? `${formatGB(m.memory.usedBytes)} / ${formatGB(m.memory.totalBytes)}` : ''}
          barPercent={m ? m.memory.usagePercent : 0} barLevel={m ? usageLevel(m.memory.usagePercent) : 'ok'} />
        <StatusCard label="開機時間" icon="⏱️" value={m ? formatUptime(m.uptimeSeconds) : '—'} sub={m ? m.hostname : ''} />
      </div>

      <div className="section-title">磁碟</div>
      <div className="card-grid">
        {(m && m.disks ? m.disks : []).map((d, i) =>
          d.ok ? (
            <StatusCard key={i} label={`磁碟 ${d.drive}`} icon="🗄️" value={formatGB(d.free)}
              sub={`剩餘 ${d.freePercent}% · 共 ${formatGB(d.total)}`}
              barPercent={d.usedPercent} barLevel={d.freePercent < 20 ? 'danger' : 'ok'} />
          ) : (
            <StatusCard key={i} label={`磁碟 ${d.drive}`} icon="🗄️" value="—" sub={d.error || '無法讀取'} />
          )
        )}
      </div>
    </div>
  );
}
