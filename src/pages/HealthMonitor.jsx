import React, { useCallback, useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import StatusCard from '../components/StatusCard.jsx';
import { formatGB, formatUptime, usageLevel } from '../utils/format.js';

function healthTone(score) {
  if (score >= 80) return 'ok';
  if (score >= 60) return 'warn';
  return 'danger';
}

export default function HealthMonitor() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!window.api) {
      setError('Electron API 尚未就緒，請在桌面 App 內使用。');
      setLoading(false);
      return;
    }

    setLoading(true);
    const res = await window.api.getSystemStatus();
    if (res.ok) {
      setStatus(res);
      setError('');
    } else {
      setError(res.error || '讀取健康狀態失敗');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [refresh]);

  const metrics = status?.metrics;
  const health = status?.health;
  const projects = status?.git?.projects || [];

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">PC HEALTH</p>
          <h1 className="page-title">健康檢查 / Git</h1>
          <p className="page-subtitle">
            結合系統壓力、磁碟空間與專案 Git 狀態，幫你快速看到目前最需要處理的項目。
          </p>
        </div>
        <div className="head-actions">
          <Button icon="RF" busy={loading} onClick={refresh}>
            重新整理
          </Button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {health ? (
        <Card className="health-panel">
          <div
            className="health-ring"
            style={{
              '--score': `${Math.max(0, Math.min(100, health.score)) * 3.6}deg`,
              '--score-color': `var(--${healthTone(health.score)})`,
            }}
          >
            <div>
              <strong>{health.score}</strong>
              <span>/ 100</span>
            </div>
          </div>
          <div className="health-copy">
            <div className="panel-label">HEALTH SUMMARY</div>
            <h2>{health.status}</h2>
            <p>
              {health.deductions?.length
                ? health.deductions
                    .map((deduction) => `${deduction.reason} (${deduction.points})`)
                    .join('、')
                : '目前沒有明顯扣分項目。'}
            </p>
            <div className="health-actions">
              <StatusBadge tone={healthTone(health.score)}>
                {health.score >= 80 ? '穩定' : health.score >= 60 ? '留意' : '處理'}
              </StatusBadge>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="metric-grid">
        <StatusCard
          label="CPU"
          icon="CP"
          value={metrics ? `${metrics.cpu.usagePercent}%` : '--'}
          sub={
            metrics
              ? `${metrics.cpu.cores} 核心${metrics.cpu.sustainedHigh ? '，持續偏高' : ''}`
              : ''
          }
          barPercent={metrics ? metrics.cpu.usagePercent : 0}
          barLevel={metrics ? usageLevel(metrics.cpu.usagePercent) : 'ok'}
        />
        <StatusCard
          label="記憶體"
          icon="RM"
          value={metrics ? `${metrics.memory.usagePercent}%` : '--'}
          sub={
            metrics
              ? `${formatGB(metrics.memory.usedBytes)} / ${formatGB(metrics.memory.totalBytes)}`
              : ''
          }
          barPercent={metrics ? metrics.memory.usagePercent : 0}
          barLevel={metrics ? usageLevel(metrics.memory.usagePercent) : 'ok'}
        />
        {(metrics?.disks || []).map((disk, index) =>
          disk.ok ? (
            <StatusCard
              key={`${disk.drive}-${index}`}
              label={`磁碟 ${disk.drive}`}
              icon="DS"
              value={formatGB(disk.free)}
              sub={`可用 ${disk.freePercent}%，總容量 ${formatGB(disk.total)}`}
              barPercent={disk.usedPercent}
              barLevel={disk.freePercent < 20 ? 'danger' : disk.freePercent < 35 ? 'warn' : 'ok'}
            />
          ) : (
            <StatusCard
              key={`${disk.drive}-${index}`}
              label={`磁碟 ${disk.drive}`}
              icon="DS"
              value="--"
              sub={disk.error || '無法讀取'}
            />
          ),
        )}
        <StatusCard
          label="開機時間"
          icon="UP"
          value={metrics ? formatUptime(metrics.uptimeSeconds) : '--'}
          sub={metrics ? metrics.hostname : ''}
        />
      </div>

      <div className="section-title">Git / 專案狀態</div>
      {projects.length === 0 ? (
        <EmptyState
          title="尚未設定 Git 專案"
          description="請到設定加入 projects，這裡會顯示未提交與長時間未更新的狀態。"
        />
      ) : (
        <Card>
          <div className="project-list">
            {projects.map((project, index) => (
              <div className="project-row" key={`${project.path}-${index}`}>
                <div className="project-main">
                  <div className="project-title">{project.name}</div>
                  <div className="project-meta">{project.path}</div>
                </div>
                <div className="result-strip">
                  <StatusBadge tone={project.error ? 'danger' : 'ok'}>
                    {project.error ? '非 Git' : 'Git'}
                  </StatusBadge>
                  <span className="muted">
                    {project.isGitRepo ? `${project.modifiedCount} 個變更` : '--'}
                  </span>
                  <span className="muted">
                    {project.hoursSinceCommit !== null
                      ? `${Math.floor(project.hoursSinceCommit)} 小時前提交`
                      : '--'}
                  </span>
                </div>
                <div className="project-note">
                  {project.error
                    ? project.error
                    : project.messages?.length
                      ? project.messages.join('、')
                      : '狀態正常'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
