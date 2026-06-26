import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import StatusCard from '../components/StatusCard.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatGB, formatUptime, usageLevel } from '../utils/format.js';

function healthTone(score) {
  if (score >= 80) return 'ok';
  if (score >= 60) return 'warn';
  return 'danger';
}

function tempLevel(value) {
  if (value == null) return 'muted';
  if (value >= 90) return 'danger';
  if (value >= 82) return 'warn';
  return 'ok';
}

function formatTemp(value) {
  return value == null ? '--' : `${value}°C`;
}

function processMemory(value) {
  return formatGB(Number(value || 0));
}

function Sparkline({ data, field, max = 100, min = 0, dangerAt, warnAt, inverse = false }) {
  const values = (data || [])
    .map((row) => row[field])
    .filter((value) => value != null && Number.isFinite(Number(value)));

  if (values.length < 2) return <div className="sparkline-empty">等待更多資料</div>;

  const width = 180;
  const height = 46;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const bounded = Math.max(min, Math.min(max, value));
      const y = height - ((bounded - min) / (max - min || 1)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const latest = values[values.length - 1];
  let cls = 'ok';
  if (inverse) {
    cls =
      dangerAt != null && latest <= dangerAt
        ? 'danger'
        : warnAt != null && latest <= warnAt
          ? 'warn'
          : 'ok';
  } else {
    cls =
      dangerAt != null && latest >= dangerAt
        ? 'danger'
        : warnAt != null && latest >= warnAt
          ? 'warn'
          : 'ok';
  }

  return (
    <svg
      className={`sparkline ${cls}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
    >
      <polyline points={points} />
    </svg>
  );
}

function buildAlerts(status, guard) {
  const metrics = status?.metrics;
  const alerts = [];
  if (!metrics) return alerts;
  const cfg = guard?.config || {};
  const hottestCpu = metrics.temperatureSummary?.hottestCpu;
  const hottestGpu = metrics.temperatureSummary?.hottestGpu;

  if (hottestCpu >= (cfg.cpuTempC || 85)) {
    alerts.push({
      level: 'danger',
      title: 'CPU 溫度超過門檻',
      desc: `目前最高 ${hottestCpu}°C，建議先降低編譯、遊戲或大量背景工作。`,
    });
  }
  if (hottestGpu >= (cfg.gpuTempC || 85)) {
    alerts.push({
      level: 'danger',
      title: 'GPU 溫度超過門檻',
      desc: `目前最高 ${hottestGpu}°C，若正在遊戲、渲染或跑 AI，建議確認散熱。`,
    });
  }
  if (metrics.memory.usagePercent >= (cfg.ramPercent || 85)) {
    alerts.push({
      level: 'warn',
      title: 'RAM 使用率偏高',
      desc: `目前 ${metrics.memory.usagePercent}%，可先查看 RAM Top List 找出占用來源。`,
    });
  }
  (metrics.disks || [])
    .filter((disk) => disk.ok)
    .forEach((disk) => {
      if (
        disk.free <= (cfg.diskFreeGb || 50) * 1024 * 1024 * 1024 ||
        disk.freePercent <= (cfg.diskFreePercent || 15)
      ) {
        alerts.push({
          level: 'warn',
          title: `${disk.drive} 磁碟空間偏低`,
          desc: `剩餘 ${formatGB(disk.free)} (${disk.freePercent}%)，建議掃描暫存、大檔與回收桶。`,
        });
      }
    });

  return alerts;
}

function modeLabel(mode) {
  if (mode === 'quiet') return '安靜模式';
  if (mode === 'strict') return '嚴格模式';
  return '一般模式';
}

function diskLabel(drive) {
  return String(drive || '').replace(/\\$/, '');
}

export default function SystemMonitor({ onNavigate }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [guard, setGuard] = useState(null);
  const [startup, setStartup] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!window.api) {
      setError('Electron API 尚未載入，請重新啟動 App。');
      setLoading(false);
      return;
    }

    setLoading(true);
    const [res, guardResult, startupResult] = await Promise.all([
      window.api.getSystemStatus(),
      window.api.getHealthGuard ? window.api.getHealthGuard() : Promise.resolve(null),
      window.api.cleanup?.getStartupItems
        ? window.api.cleanup.getStartupItems()
        : Promise.resolve(null),
    ]);

    if (res.ok) {
      setStatus(res);
      setError('');
    } else {
      setError(res.error || '讀取系統監控資料失敗。');
    }
    if (guardResult?.ok) setGuard(guardResult);
    if (startupResult) setStartup(startupResult);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const metrics = status?.metrics;
  const health = status?.health;
  const disks = metrics?.disks || [];
  const trends = metrics?.trends || [];
  const tempSummary = metrics?.temperatureSummary || {};
  const alerts = useMemo(() => buildAlerts(status, guard), [status, guard]);
  const topCpu = metrics?.topProcesses?.cpu || [];
  const topMem = metrics?.topProcesses?.memory || [];
  const startupItems = startup?.items || [];
  const cDrive = disks.find(
    (disk) => disk.ok && /^c:\\?$/i.test(String(disk.drive || '').replace(/\//g, '\\')),
  );
  const dDrive = disks.find(
    (disk) => disk.ok && /^d:\\?$/i.test(String(disk.drive || '').replace(/\//g, '\\')),
  );

  const setMonitorMode = async (mode) => {
    const patch =
      mode === 'quiet'
        ? {
            mode,
            enabled: true,
            cooldownMinutes: 120,
            cpuTempC: 90,
            gpuTempC: 90,
            ramPercent: 92,
            diskFreeGb: 25,
          }
        : mode === 'strict'
          ? {
              mode,
              enabled: true,
              cooldownMinutes: 15,
              cpuTempC: 80,
              gpuTempC: 80,
              ramPercent: 78,
              diskFreeGb: 80,
            }
          : {
              mode,
              enabled: true,
              cooldownMinutes: 30,
              cpuTempC: 85,
              gpuTempC: 85,
              ramPercent: 85,
              diskFreeGb: 50,
            };
    const result = await window.api.saveHealthGuard(patch);
    toast(
      result.ok ? `已切換為${modeLabel(mode)}` : result.error || '儲存監控模式失敗',
      result.ok ? 'ok' : 'error',
    );
    refresh();
  };

  const checkNow = async () => {
    const result = await window.api.checkHealthGuardNow();
    toast(
      result.ok ? `檢查完成，觸發 ${result.fired?.length || 0} 則通知` : result.error || '檢查失敗',
      result.ok ? 'ok' : 'error',
    );
    refresh();
  };

  return (
    <div>
      <PageHeader
        eyebrow="LIVE MONITOR"
        title="系統監控"
        description="每 4 秒更新 CPU、記憶體、磁碟、溫度、啟動項與高占用程式，協助判斷電腦是否需要整理或降載。"
        actions={
          <>
            <StatusBadge tone={guard?.running ? 'ok' : 'warn'}>
              {guard?.running ? '監控中' : '監控未啟動'}
            </StatusBadge>
            <Button icon="RF" busy={loading} onClick={refresh}>
              重新整理
            </Button>
          </>
        }
      />

      {error ? <div className="error-banner">{error}</div> : null}

      {health ? (
        <SectionPanel className="monitor-hero">
          <div className="health-strip">
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
            <div>
              <div className="panel-label">PC HEALTH SCORE</div>
              <h2>{health.status}</h2>
              <p className="muted">
                依 CPU、RAM、磁碟空間、溫度、Downloads 與 Git 狀態計算，所有扣分原因都列在下方。
              </p>
            </div>
            <StatusBadge tone={healthTone(health.score)}>{health.status}</StatusBadge>
          </div>
        </SectionPanel>
      ) : null}

      <div className="metric-grid">
        <StatusCard
          label="CPU"
          icon="CP"
          value={metrics ? `${metrics.cpu.usagePercent}%` : '--'}
          sub={metrics ? `${metrics.cpu.cores} 核心` : ''}
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
        <StatusCard
          label="CPU 最高溫"
          icon="CT"
          value={formatTemp(tempSummary.hottestCpu)}
          sub={
            tempSummary.cpuAvailable
              ? `平均 ${formatTemp(tempSummary.averageCpu)}，${tempSummary.cpuCoreCount} 核心`
              : '等待 Core Temp 或硬體感測資料'
          }
          barPercent={tempSummary.hottestCpu || 0}
          barLevel={tempLevel(tempSummary.hottestCpu)}
        />
        <StatusCard
          label="GPU 溫度"
          icon="GT"
          value={formatTemp(tempSummary.hottestGpu)}
          sub={tempSummary.gpuAvailable ? '已讀取顯卡溫度' : '尚未偵測到 GPU 溫度'}
          barPercent={tempSummary.hottestGpu || 0}
          barLevel={tempLevel(tempSummary.hottestGpu)}
        />
        <StatusCard
          label="開機時間"
          icon="UP"
          value={metrics ? formatUptime(metrics.uptimeSeconds) : '--'}
          sub={metrics ? metrics.hostname : ''}
        />
      </div>

      <SectionPanel
        title="即時趨勢"
        description="保留最近約 1 到 5 分鐘的趨勢，幫你看出是瞬間尖峰還是持續壓力。"
      >
        <div className="trend-grid">
          <div className="trend-card">
            <strong>CPU</strong>
            <Sparkline data={trends} field="cpu" warnAt={80} dangerAt={90} />
            <span>{metrics?.cpu?.usagePercent ?? '--'}%</span>
          </div>
          <div className="trend-card">
            <strong>RAM</strong>
            <Sparkline data={trends} field="ram" warnAt={80} dangerAt={90} />
            <span>{metrics?.memory?.usagePercent ?? '--'}%</span>
          </div>
          <div className="trend-card">
            <strong>CPU 溫度</strong>
            <Sparkline data={trends} field="cpuTemp" warnAt={82} dangerAt={90} />
            <span>{formatTemp(tempSummary.hottestCpu)}</span>
          </div>
          <div className="trend-card">
            <strong>GPU 溫度</strong>
            <Sparkline data={trends} field="gpuTemp" warnAt={82} dangerAt={90} />
            <span>{formatTemp(tempSummary.hottestGpu)}</span>
          </div>
          <div className="trend-card">
            <strong>D 槽剩餘</strong>
            <Sparkline
              data={trends}
              field="dFreePercent"
              max={100}
              warnAt={30}
              dangerAt={15}
              inverse
            />
            <span>{dDrive ? `${dDrive.freePercent}%` : '--'}</span>
          </div>
        </div>
      </SectionPanel>

      <div className="dashboard-columns">
        <SectionPanel
          title="下一步建議"
          description="只有達到門檻的項目才會出現在這裡，避免只看到警告卻不知道該做什麼。"
        >
          {alerts.length ? (
            alerts.map((alert, index) => (
              <InlineAlert key={`${alert.title}-${index}`} tone={alert.level} title={alert.title}>
                {alert.desc}
              </InlineAlert>
            ))
          ) : (
            <InlineAlert tone="ok" title="目前沒有需要立即處理的項目">
              系統狀態穩定，可維持目前使用方式。
            </InlineAlert>
          )}
          <div className="head-actions">
            <Button size="sm" onClick={checkNow}>
              立即健康檢查
            </Button>
            <Button size="sm" onClick={() => onNavigate && onNavigate('cleanup')}>
              前往 Clean Center
            </Button>
          </div>
        </SectionPanel>

        <SectionPanel title="健康守護模式" description="控制背景監控的提醒門檻與冷卻時間。">
          <div className="mode-tabs">
            {['quiet', 'normal', 'strict'].map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={(guard?.config?.mode || 'normal') === mode ? 'primary' : 'ghost'}
                onClick={() => setMonitorMode(mode)}
              >
                {modeLabel(mode)}
              </Button>
            ))}
          </div>
          <div className="summary-list">
            <div className="summary-row">
              <strong>檢查頻率</strong>
              <span>{guard?.config?.intervalMinutes || 5} 分鐘</span>
            </div>
            <div className="summary-row">
              <strong>通知冷卻</strong>
              <span>{guard?.config?.cooldownMinutes || 30} 分鐘</span>
            </div>
            <div className="summary-row">
              <strong>CPU/GPU 溫度門檻</strong>
              <span>
                {guard?.config?.cpuTempC || 85}°C / {guard?.config?.gpuTempC || 85}°C
              </span>
            </div>
          </div>
        </SectionPanel>
      </div>

      <SectionPanel
        title="CPU 各核心溫度"
        description="優先讀取 Core Temp shared memory，也會嘗試 LibreHardwareMonitor、OpenHardwareMonitor、WMI。"
      >
        {metrics?.temperatures?.cpuCores?.length ? (
          <div className="temperature-grid">
            {metrics.temperatures.cpuCores.slice(0, 10).map((sensor, index) => (
              <div
                className={`temperature-tile ${tempLevel(sensor.temperatureC)}`}
                key={sensor.id || `${sensor.name}-${index}`}
              >
                <span>{sensor.name || `Core ${index + 1}`}</span>
                <strong>{formatTemp(sensor.temperatureC)}</strong>
                {typeof sensor.loadPercent === 'number' ? (
                  <em>{sensor.loadPercent}% load</em>
                ) : (
                  <em>{sensor.source}</em>
                )}
              </div>
            ))}
          </div>
        ) : (
          <InlineAlert tone="warn" title="目前尚未讀到 CPU 溫度">
            請確認 Core Temp 已啟動，或在 Core Temp 設定中允許 shared memory。App 會自動嘗試啟動
            Core Temp。
          </InlineAlert>
        )}
      </SectionPanel>

      <SectionPanel
        title="磁碟空間與健康"
        description="顯示 C 槽、D 槽與偵測到的其他磁碟；低空間時可直接前往 Clean Center。"
      >
        {disks.length === 0 ? (
          <EmptyState title="尚無磁碟資料" />
        ) : (
          <div className="card-grid">
            {disks.map((disk, index) =>
              disk.ok ? (
                <StatusCard
                  key={`${disk.drive}-${index}`}
                  label={`磁碟 ${diskLabel(disk.drive)}`}
                  icon="DS"
                  value={formatGB(disk.free)}
                  sub={`可用 ${disk.freePercent}% / 總容量 ${formatGB(disk.total)} / 已用 ${formatGB(disk.used)}`}
                  barPercent={disk.usedPercent}
                  barLevel={
                    disk.freePercent < 15 ? 'danger' : disk.freePercent < 30 ? 'warn' : 'ok'
                  }
                />
              ) : (
                <StatusCard
                  key={`${disk.drive}-${index}`}
                  label={`磁碟 ${diskLabel(disk.drive)}`}
                  icon="DS"
                  value="--"
                  sub={disk.error || '無法讀取'}
                />
              ),
            )}
          </div>
        )}
        <div className="head-actions">
          <Button size="sm" onClick={() => onNavigate && onNavigate('cleanup')}>
            掃描大檔案
          </Button>
          <Button size="sm" onClick={() => onNavigate && onNavigate('cleanup')}>
            前往 Clean Center
          </Button>
        </div>
      </SectionPanel>

      <div className="dashboard-columns">
        <SectionPanel
          title="CPU Top List"
          description="排序目前 CPU 累積使用量較高的程式，適合找出背景壓力來源。"
        >
          <DataTable
            rows={topCpu}
            emptyTitle="尚無程序資料"
            columns={[
              { key: 'name', label: '程序', render: (row) => <strong>{row.name}</strong> },
              { key: 'pid', label: 'PID' },
              { key: 'cpuSeconds', label: 'CPU 秒數' },
              { key: 'memoryBytes', label: 'RAM', render: (row) => processMemory(row.memoryBytes) },
            ]}
          />
        </SectionPanel>
        <SectionPanel title="RAM Top List" description="排序目前記憶體占用較高的程式。">
          <DataTable
            rows={topMem}
            emptyTitle="尚無程序資料"
            columns={[
              { key: 'name', label: '程序', render: (row) => <strong>{row.name}</strong> },
              { key: 'pid', label: 'PID' },
              { key: 'memoryBytes', label: 'RAM', render: (row) => processMemory(row.memoryBytes) },
              { key: 'cpuSeconds', label: 'CPU 秒數' },
            ]}
          />
        </SectionPanel>
      </div>

      <SectionPanel
        title="開機負擔分析"
        description="檢查使用者 Startup 資料夾。項目越多，登入後桌面準備時間通常越長。"
      >
        <div className="metric-grid">
          <StatusCard
            label="啟動項目"
            icon="ST"
            value={String(startupItems.length)}
            sub={startup?.startupDir || '尚未讀取 Startup 資料夾'}
            barPercent={Math.min(100, startupItems.length * 8)}
            barLevel={startupItems.length > 12 ? 'danger' : startupItems.length > 6 ? 'warn' : 'ok'}
          />
          <StatusCard
            label="目前開機時間"
            icon="UP"
            value={metrics ? formatUptime(metrics.uptimeSeconds) : '--'}
            sub="重開機後累積時間"
          />
          <StatusCard
            label="C 槽剩餘"
            icon="C"
            value={cDrive ? formatGB(cDrive.free) : '--'}
            sub={cDrive ? `${cDrive.freePercent}% 可用` : '尚未偵測'}
            barPercent={cDrive ? cDrive.usedPercent : 0}
            barLevel={
              cDrive && cDrive.freePercent < 15
                ? 'danger'
                : cDrive && cDrive.freePercent < 30
                  ? 'warn'
                  : 'ok'
            }
          />
          <StatusCard
            label="D 槽剩餘"
            icon="D"
            value={dDrive ? formatGB(dDrive.free) : '--'}
            sub={dDrive ? `${dDrive.freePercent}% 可用` : '尚未偵測'}
            barPercent={dDrive ? dDrive.usedPercent : 0}
            barLevel={
              dDrive && dDrive.freePercent < 15
                ? 'danger'
                : dDrive && dDrive.freePercent < 30
                  ? 'warn'
                  : 'ok'
            }
          />
        </div>
        <DataTable
          rows={startupItems.slice(0, 8)}
          emptyTitle="Startup 資料夾沒有啟動項目"
          columns={[
            { key: 'name', label: '名稱', render: (row) => <strong>{row.name}</strong> },
            {
              key: 'isShortcut',
              label: '類型',
              render: (row) => (row.isShortcut ? '捷徑' : '檔案'),
            },
            {
              key: 'mtime',
              label: '最後修改',
              render: (row) => (row.mtime ? new Date(row.mtime).toLocaleString() : '--'),
            },
            {
              key: 'path',
              label: '來源路徑',
              render: (row) => <span className="path">{row.path}</span>,
            },
          ]}
        />
      </SectionPanel>

      <div className="dashboard-columns">
        <SectionPanel
          title="健康分數扣分原因"
          description="每一項都附上影響與建議動作，方便判斷優先順序。"
        >
          <DataTable
            rows={health?.deductions || []}
            emptyTitle="目前沒有扣分原因"
            columns={[
              { key: 'reason', label: '原因', render: (row) => <strong>{row.reason}</strong> },
              { key: 'impact', label: '影響' },
              { key: 'action', label: '建議動作' },
              { key: 'points', label: '分數' },
            ]}
          />
        </SectionPanel>

        <SectionPanel
          title="硬體摘要"
          description="提供排查溫度、效能與感測器來源時需要的基本資訊。"
        >
          <div className="summary-list">
            <div className="summary-row">
              <strong>CPU</strong>
              <span>
                {metrics?.hardware?.cpuModel || '--'} ({metrics?.hardware?.cpuCores || '--'} 核心)
              </span>
            </div>
            <div className="summary-row">
              <strong>RAM</strong>
              <span>{metrics?.hardware ? formatGB(metrics.hardware.ramBytes) : '--'}</span>
            </div>
            <div className="summary-row">
              <strong>GPU</strong>
              <span>{metrics?.hardware?.gpuName || '尚未讀取 GPU 名稱'}</span>
            </div>
            <div className="summary-row">
              <strong>OS</strong>
              <span>
                {metrics?.hardware
                  ? `${metrics.hardware.osType} ${metrics.hardware.osRelease} (${metrics.hardware.arch})`
                  : '--'}
              </span>
            </div>
            <div className="summary-row">
              <strong>感測器來源</strong>
              <span>{(metrics?.hardware?.sensorSources || []).join(' / ') || '尚無'}</span>
            </div>
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}
