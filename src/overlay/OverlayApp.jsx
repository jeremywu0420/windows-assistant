import React, { useEffect, useMemo, useState } from 'react';
import '../styles/overlay.css';

const DEFAULT_SETTINGS = {
  enabled: false,
  showFps: true,
  showCpu: true,
  showGpu: true,
  showRam: true,
  updateIntervalMs: 1000,
  fontSize: 14,
  opacity: 0.92,
  position: 'top-left',
  clickThrough: true,
};

function isNumber(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

function valueOrNa(value, suffix = '') {
  return isNumber(value) ? `${value}${suffix}` : 'N/A';
}

function bytesToGb(value) {
  if (!isNumber(value)) return null;
  return Math.round((Number(value) / 1024 ** 3) * 10) / 10;
}

function ramText(ram = {}) {
  const used = bytesToGb(ram.usedBytes);
  const total = bytesToGb(ram.totalBytes);
  if (used == null || total == null) return 'RAM N/A';
  return `RAM ${used.toFixed(1)}/${total.toFixed(1)}GB`;
}

function vramText(gpu = {}) {
  const used = bytesToGb(gpu.vramUsedBytes);
  const total = bytesToGb(gpu.vramTotalBytes);
  if (used == null || total == null) return 'N/A/N/A';
  return `${used.toFixed(1)}/${total.toFixed(1)}GB`;
}

export default function OverlayApp() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    document.documentElement.classList.add('overlay-document');
    document.body.classList.add('overlay-body');
    return () => {
      document.documentElement.classList.remove('overlay-document');
      document.body.classList.remove('overlay-body');
    };
  }, []);

  useEffect(() => {
    if (!window.api?.overlay) return undefined;
    let mounted = true;
    window.api.overlay
      .getSettings()
      .then((result) => {
        if (mounted && result?.settings) setSettings({ ...DEFAULT_SETTINGS, ...result.settings });
      })
      .catch(() => {});
    window.api.overlay
      .getSnapshot()
      .then((snapshot) => {
        if (mounted) setMetrics(snapshot);
      })
      .catch(() => {});
    const offMetrics = window.api.overlay.onMetrics((snapshot) => setMetrics(snapshot));
    const offSettings = window.api.overlay.onSettings((next) =>
      setSettings({ ...DEFAULT_SETTINGS, ...next }),
    );
    return () => {
      mounted = false;
      offMetrics && offMetrics();
      offSettings && offSettings();
    };
  }, []);

  const style = useMemo(
    () => ({
      '--overlay-font-size': `${settings.fontSize || 14}px`,
      '--overlay-opacity': settings.opacity ?? 0.92,
    }),
    [settings.fontSize, settings.opacity],
  );

  const fps = metrics?.fps || {};
  const cpu = metrics?.cpu || {};
  const gpu = metrics?.gpu || {};
  const ram = metrics?.ram || {};

  return (
    <div
      className={`overlay-osd-root ${settings.clickThrough === false ? 'is-draggable' : ''}`}
      style={style}
    >
      <div className="overlay-osd-line">
        {settings.showFps !== false ? (
          <span className="overlay-group overlay-fps">
            <span>FPS {valueOrNa(fps.fps)}</span>
            <span>1% LOW {valueOrNa(fps.low1)}</span>
          </span>
        ) : null}

        {settings.showCpu !== false ? (
          <span className="overlay-group overlay-cpu">
            <span>CPU {valueOrNa(cpu.usagePercent, '%')}</span>
            <span>/ {valueOrNa(cpu.powerWatts, 'W')}</span>
            <span>{valueOrNa(cpu.temperatureC, '°C')}</span>
            <span>{valueOrNa(cpu.clockGhz, 'GHz')}</span>
          </span>
        ) : null}

        {settings.showGpu !== false ? (
          <span className="overlay-group overlay-gpu">
            <span>GPU {valueOrNa(gpu.usagePercent, '%')}</span>
            <span>{valueOrNa(gpu.temperatureC, '°C')}</span>
            <span>{vramText(gpu)}</span>
          </span>
        ) : null}

        {settings.showRam !== false ? (
          <span className="overlay-group overlay-ram">
            <span>{ramText(ram)}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
