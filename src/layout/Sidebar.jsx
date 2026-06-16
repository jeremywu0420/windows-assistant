import React from 'react';

export const NAV_SECTIONS = [
  {
    section: '主要',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: '📊' },
      { key: 'files', label: 'Downloads', icon: '🗂️' },
      { key: 'automations', label: 'Automations', icon: '⚡' },
      { key: 'monitor', label: 'System Monitor', icon: '📈' },
    ],
  },
  {
    section: '工具',
    items: [
      { key: 'modes', label: '工作模式', icon: '🚀' },
      { key: 'projects', label: 'Project Hub', icon: '📁' },
      { key: 'screenshots', label: '截圖整理', icon: '🖼️' },
      { key: 'rules', label: 'Smart Rules', icon: '🔔' },
      { key: 'health', label: 'Git / 健康', icon: '❤️' },
    ],
  },
  {
    section: '系統',
    items: [{ key: 'settings', label: '設定', icon: '⚙️' }],
  },
];

export const PAGE_TITLES = NAV_SECTIONS.flatMap((s) => s.items).reduce((acc, it) => {
  acc[it.key] = it.label;
  return acc;
}, {});

export default function Sidebar({ current, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot" />
        <span>PC Life Assistant</span>
      </div>
      <nav>
        {NAV_SECTIONS.map((sec) => (
          <div key={sec.section}>
            <div className="nav-section">{sec.section}</div>
            {sec.items.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${current === item.key ? 'active' : ''}`}
                onClick={() => onNavigate(item.key)}
              >
                <span className="icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="spacer" />
      <div className="footer">
        v2.0 · 常駐系統匣
        <br />
        Ctrl+K 快捷指令
      </div>
    </aside>
  );
}
