import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { useLocale } from '../i18n.jsx';

function LineIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

export default function Topbar({ title, onOpenPalette, onNavigate }) {
  const { cycleTheme } = useTheme();
  const { language, setLanguage, t } = useLocale();
  const [unread, setUnread] = useState(0);
  const [profile, setProfile] = useState({ name: 'Jeremy', initials: 'JW' });

  useEffect(() => {
    if (!window.api) return undefined;
    let mounted = true;
    const refresh = async () => {
      const [notifications, settings] = await Promise.all([
        window.api.listNotifications ? window.api.listNotifications().catch(() => null) : null,
        window.api.getSettings ? window.api.getSettings().catch(() => null) : null,
      ]);
      if (!mounted) return;
      if (notifications?.ok) setUnread(notifications.unreadCount || 0);
      const configuredName =
        settings?.settings?.general?.displayName || settings?.settings?.general?.userName;
      if (configuredName) {
        const initials = configuredName
          .split(/\s+/)
          .map((part) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        setProfile({ name: configuredName, initials: initials || 'U' });
      }
    };
    refresh();
    const id = setInterval(refresh, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [],
  );

  return (
    <header className="topbar">
      <div className="tb-welcome">
        <span>{today}</span>
        <strong>{t('shell.welcome')}</strong>
        <em>{title}</em>
      </div>

      <button
        type="button"
        className="tb-search"
        onClick={onOpenPalette}
        title={`${t('shell.search')} (Ctrl+K)`}
      >
        <LineIcon>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4" />
        </LineIcon>
        <span className="tb-search-text">{t('shell.search')}</span>
        <span className="kbd">Ctrl K</span>
      </button>

      <div className="tb-actions">
        <button
          type="button"
          className="tb-icon-btn"
          onClick={() => onNavigate && onNavigate('notifications')}
          title={t('shell.notifications')}
        >
          <LineIcon>
            <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
            <path d="M10 20h4" />
          </LineIcon>
          {unread ? <span className="tb-badge">{unread}</span> : null}
        </button>
        <button
          type="button"
          className="tb-icon-btn"
          onClick={() => onNavigate && onNavigate('settings')}
          title={t('shell.settings')}
        >
          <LineIcon>
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 3v2M12 19v2M4.2 7.5l1.7 1M18.1 15.5l1.7 1M4.2 16.5l1.7-1M18.1 8.5l1.7-1M3 12h2M19 12h2" />
          </LineIcon>
        </button>
        <button
          type="button"
          className="tb-icon-btn"
          onClick={cycleTheme}
          title={t('shell.toggleTheme')}
        >
          <LineIcon>
            <path d="M12 3a7 7 0 1 0 7 7 5 5 0 0 1-7-7z" />
          </LineIcon>
        </button>
        <button
          type="button"
          className="tb-lang"
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
          title={t('shell.language')}
        >
          {language === 'zh' ? '中文' : 'EN'}
        </button>
        <button
          type="button"
          className="tb-user"
          onClick={() => onNavigate && onNavigate('settings')}
        >
          <span>{profile.initials}</span>
          <strong>{profile.name}</strong>
        </button>
      </div>
    </header>
  );
}
