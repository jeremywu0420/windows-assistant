import React, { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '../../utils/format.js';

function useCountUp(value) {
  const target = Number(value || 0);
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    const start = display;
    const delta = target - start;
    if (!Number.isFinite(target) || Math.abs(delta) < 1) {
      setDisplay(target);
      return undefined;
    }
    let frame = 0;
    let raf = 0;
    const total = 24;
    const tick = () => {
      frame += 1;
      const progress = 1 - Math.pow(1 - frame / total, 3);
      setDisplay(Math.round(start + delta * progress));
      if (frame < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return display;
}

function formatValue(value, format) {
  if (value == null) return 'Unavailable';
  if (format === 'bytes') return formatBytes(value);
  if (format === 'percent') return `${value}%`;
  return new Intl.NumberFormat().format(value);
}

export default function StatCard({
  label,
  icon,
  value,
  format,
  sub,
  tone = 'normal',
  loading = false,
  onClick,
}) {
  const numeric = typeof value === 'number' && format !== 'bytes';
  const display = useCountUp(numeric ? value : 0);
  const shown = useMemo(
    () => (numeric ? formatValue(display, format) : formatValue(value, format)),
    [display, format, numeric, value],
  );

  return (
    <button
      type="button"
      className={`dash-stat-card glass-card tone-${tone}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="dash-stat-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="dash-stat-copy">
        <span className="dash-stat-label">{label}</span>
        {loading ? (
          <span className="dash-skeleton dash-skeleton-value" />
        ) : (
          <strong>{shown}</strong>
        )}
        {sub ? <span>{sub}</span> : null}
      </span>
    </button>
  );
}
