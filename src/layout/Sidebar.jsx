import React from 'react';

// Injected by Vite (see vite.config.mjs) from package.json; guarded so it never throws.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';

export const NAV_SECTIONS = [
  {
    section: 'Home',
    items: [
      { key: 'dashboard', label: '每日工作台', icon: 'HM' },
      { key: 'setup', label: '設定精靈', icon: 'SU' },
    ],
  },
  {
    section: 'Organize',
    items: [
      { key: 'files', label: '檔案整理', icon: 'DL' },
      { key: 'screenshots', label: '截圖整理', icon: 'SC' },
      { key: 'cleanup', label: 'Clean Center', icon: 'CC' },
      { key: 'automations', label: '自動化', icon: 'AU' },
    ],
  },
  {
    section: 'Workspace',
    items: [
      { key: 'projects', label: 'Project Hub', icon: 'PH' },
      { key: 'workspaceTemplates', label: '工作區模板', icon: 'WT' },
      { key: 'modes', label: '工作模式', icon: 'MO' },
      { key: 'cheatsheet', label: '指令大全', icon: 'CS' },
      { key: 'toolchain', label: '環境健檢', icon: 'TC' },
      { key: 'eeTools', label: 'EE 工具', icon: 'EE' },
      { key: 'embedded', label: '嵌入式工具', icon: 'EB' },
    ],
  },
  {
    section: 'System',
    items: [
      { key: 'notifications', label: '通知中心', icon: 'NC' },
      { key: 'history', label: '活動與復原', icon: 'HI' },
      { key: 'monitor', label: '系統監控', icon: 'SM' },
      { key: 'rules', label: '智慧規則', icon: 'RU' },
      { key: 'health', label: '健康檢查', icon: 'GH' },
    ],
  },
  {
    section: 'Settings',
    items: [{ key: 'settings', label: '設定中心', icon: 'SE' }],
  },
];

export const PAGE_TITLES = NAV_SECTIONS.flatMap((section) => section.items).reduce((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

export default function Sidebar({ current, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">PC</span>
        <span>
          <span className="brand-name">PC Life Assistant</span>
          <span className="brand-caption">Windows 工作台</span>
        </span>
      </div>

      <nav className="sidebar-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.section}>
            <div className="nav-section">{section.section}</div>
            {section.items.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${current === item.key ? 'active' : ''}`}
                onClick={() => onNavigate(item.key)}
                type="button"
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
        <div className="footer-title">{APP_VERSION ? `v${APP_VERSION}` : ''}</div>
        <div>Ctrl+K 開啟命令面板</div>
      </div>
    </aside>
  );
}
