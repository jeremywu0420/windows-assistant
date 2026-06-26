import React, { useEffect, useState } from 'react';
import NexusLogo from '../components/NexusLogo.jsx';
import { useLocale } from '../i18n.jsx';

export const NAV_SECTIONS = [
  {
    section: 'nav.core',
    items: [
      { key: 'dashboard', label: 'nav.dashboard', icon: 'dashboard' },
      { key: 'files', label: 'nav.files', icon: 'folder' },
      { key: 'projects', label: 'nav.projects', icon: 'nodes' },
      { key: 'cleanup', label: 'nav.cleanup', icon: 'spark' },
      { key: 'monitor', label: 'nav.monitor', icon: 'pulse' },
      { key: 'security', label: '安全性中心', icon: 'securityCenter' },
      { key: 'automations', label: 'nav.automations', icon: 'bolt' },
      { key: 'workflows', label: 'nav.workflows', icon: 'nodes' },
      { key: 'settings', label: 'nav.settings', icon: 'gear' },
    ],
  },
  {
    section: 'nav.tools',
    items: [
      { key: 'screenshots', label: 'nav.screenshots', icon: 'image' },
      { key: 'workspaceTemplates', label: 'nav.workspaceTemplates', icon: 'template' },
      { key: 'modes', label: 'nav.modes', icon: 'play' },
      { key: 'rules', label: 'nav.rules', icon: 'rules' },
      { key: 'history', label: 'nav.history', icon: 'history' },
    ],
  },
  {
    section: 'nav.advanced',
    items: [
      { key: 'notifications', label: 'nav.notifications', icon: 'bell' },
      { key: 'health', label: 'nav.health', icon: 'shield' },
      { key: 'toolchain', label: 'nav.toolchain', icon: 'terminal' },
      { key: 'eeTools', label: 'nav.eeTools', icon: 'chip' },
      { key: 'embedded', label: 'nav.embedded', icon: 'cpu' },
      { key: 'cheatsheet', label: 'nav.cheatsheet', icon: 'keys' },
      { key: 'setup', label: 'nav.setup', icon: 'wand' },
    ],
  },
];

export const PAGE_TITLE_KEYS = NAV_SECTIONS.flatMap((section) => section.items).reduce(
  (acc, item) => {
    acc[item.key] = item.label;
    return acc;
  },
  {},
);

function Icon({ name }) {
  const paths = {
    dashboard: <path d="M4 5h6v6H4zM14 5h6v4h-6zM14 13h6v6h-6zM4 15h6v4H4z" />,
    folder: <path d="M3 7h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    nodes: <path d="M7 7h.01M17 6h.01M12 17h.01M8 8l3 7M16 8l-3 7M9 7h6" />,
    spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    securityCenter: <path d="M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7zM9 12l2 2 4-5" />,
    bolt: <path d="M13 2L5 13h6l-2 9 8-12h-6z" />,
    gear: (
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 12h2M18 12h2M12 4v2M12 18v2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M17.5 6.5l-1.4 1.4M7.9 16.1l-1.4 1.4" />
    ),
    image: <path d="M4 5h16v14H4zM7 15l3-3 2 2 3-4 3 5M8 8h.01" />,
    template: <path d="M4 4h16v5H4zM4 13h7v7H4zM15 13h5v7h-5z" />,
    play: <path d="M8 5v14l11-7z" />,
    rules: <path d="M5 6h14M5 12h14M5 18h9M3 6h.01M3 12h.01M3 18h.01" />,
    history: <path d="M4 12a8 8 0 1 0 3-6.2M4 5v5h5M12 8v5l3 2" />,
    bell: <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" />,
    shield: <path d="M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z" />,
    terminal: <path d="M4 6h16v12H4zM7 10l2 2-2 2M11 15h5" />,
    chip: <path d="M8 8h8v8H8zM4 10h4M4 14h4M16 10h4M16 14h4M10 4v4M14 4v4M10 16v4M14 16v4" />,
    cpu: (
      <path d="M7 7h10v10H7zM10 10h4v4h-4zM3 9h4M3 15h4M17 9h4M17 15h4M9 3v4M15 3v4M9 17v4M15 17v4" />
    ),
    keys: <path d="M7 14a4 4 0 1 1 2.8-6.8L21 18.4V21h-2.6l-2-2H14v-2.4l-2-2A4 4 0 0 1 7 14z" />,
    wand: <path d="M4 20L20 4M14 4h6v6M5 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name] || paths.dashboard}
      </g>
    </svg>
  );
}

function SystemStatusCard() {
  const { t } = useLocale();
  const [state, setState] = useState({ paused: false, watched: 0, ok: false });

  useEffect(() => {
    if (!window.api?.getMonitorState) return undefined;
    let mounted = true;
    const refresh = () => {
      window.api
        .getMonitorState()
        .then((result) => {
          if (mounted && result?.ok) setState(result);
        })
        .catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="sidebar-status-card">
      <div>
        <span className={state.paused ? 'status-dot warn' : 'status-dot good'} />
        <strong>{t('shell.systemStatus')}</strong>
      </div>
      <p>{state.paused ? t('shell.monitoringPaused') : t('shell.monitoringActive')}</p>
      <em>
        {state.watched || 0} {t('shell.watchedFolders')}
      </em>
    </div>
  );
}

export default function Sidebar({ current, onNavigate }) {
  const { t } = useLocale();
  return (
    <aside className="sidebar">
      <div className="brand">
        <NexusLogo className="brand-mark" />
        <span className="brand-wordmark">
          <span className="brand-name">
            NE<span className="brand-x">X</span>US
          </span>
          <span className="brand-caption">PC Life Assistant</span>
        </span>
      </div>

      <nav className="sidebar-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.section}>
            <div className="nav-section">{t(section.section)}</div>
            {section.items.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${current === item.key ? 'active' : ''}`}
                onClick={() => onNavigate(item.key)}
                type="button"
              >
                <span className="icon">
                  <Icon name={item.icon} />
                </span>
                <span>{t(item.label)}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="spacer" />
      <SystemStatusCard />
    </aside>
  );
}
