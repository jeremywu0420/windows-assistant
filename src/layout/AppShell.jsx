import React from 'react';
import Sidebar, { PAGE_TITLES } from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppShell({ current, onNavigate, onOpenPalette, children }) {
  return (
    <div className="app-shell">
      <Sidebar current={current} onNavigate={onNavigate} />
      <div className="app-main">
        <Topbar title={PAGE_TITLES[current] || 'PC Life Assistant'} onOpenPalette={onOpenPalette} />
        <div className="content-scroll">{children}</div>
      </div>
    </div>
  );
}
