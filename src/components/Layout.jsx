import React from 'react';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'projects', label: 'Project Hub', icon: '📁' },
  { key: 'modes', label: '工作模式', icon: '🚀' },
  { key: 'files', label: '整理 Downloads', icon: '🗂️' },
  { key: 'screenshots', label: '截圖整理', icon: '🖼️' },
  { key: 'rules', label: 'Smart Rules', icon: '🔔' },
  { key: 'health', label: '健康監控 / Git', icon: '❤️' },
  { key: 'settings', label: '設定', icon: '⚙️' },
];

export default function Layout({ current, onNavigate, children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" />
          PC Life Assistant
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${current === item.key ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="footer">
          v1.1.0
          <br />
          Ctrl+Alt+Shift+N 快速指令
          <br />
          常駐於系統匣
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
