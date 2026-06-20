import React, { useMemo } from 'react';
import Sidebar, { PAGE_TITLES } from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

function AppBackground() {
  const dots = useMemo(() => Array.from({ length: 16 }, () => ({
    left: Math.round(Math.random() * 100),
    top: Math.round(Math.random() * 100),
    size: 2 + Math.round(Math.random() * 3),
    dur: 9 + Math.round(Math.random() * 11),
    delay: -Math.round(Math.random() * 16),
  })), []);
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="grid" />
      <div className="ring r1" />
      <div className="ring r2" />
      <div className="ring r3" />
      <div className="particles">
        {dots.map((d, i) => (
          <i
            key={i}
            style={{
              left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size,
              animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AppShell({ current, onNavigate, onOpenPalette, children }) {
  return (
    <div className="app-shell">
      <AppBackground />
      <Sidebar current={current} onNavigate={onNavigate} />
      <div className="app-main">
        <Topbar title={PAGE_TITLES[current] || 'PC Life Assistant'} onOpenPalette={onOpenPalette} onNavigate={onNavigate} />
        <div className="content-scroll">{children}</div>
      </div>
    </div>
  );
}
