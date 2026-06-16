import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const THEMES = ['system', 'light', 'dark'];

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyToDocument(theme, accent, compact) {
  const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-compact', compact ? 'true' : 'false');
  if (accent) {
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-strong', accent);
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('system');
  const [accent, setAccentState] = useState('#4f8cff');
  const [compact, setCompactState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load persisted appearance settings once.
  useEffect(() => {
    (async () => {
      try {
        if (window.api) {
          const res = await window.api.getSettings();
          const g = (res.settings && res.settings.general) || {};
          if (THEMES.includes(g.theme)) setThemeState(g.theme);
          if (g.accentColor) setAccentState(g.accentColor);
          setCompactState(!!g.compactMode);
        }
      } catch (_) {
        /* fall back to defaults */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Apply on any change.
  useEffect(() => {
    applyToDocument(theme, accent, compact);
  }, [theme, accent, compact]);

  // Follow OS theme changes when in 'system' mode.
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (theme === 'system') applyToDocument(theme, accent, compact);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme, accent, compact]);

  const persist = useCallback(async (patch) => {
    if (!window.api) return;
    try {
      const res = await window.api.getSettings();
      const next = { ...res.settings, general: { ...(res.settings.general || {}), ...patch } };
      await window.api.saveSettings(next);
    } catch (_) {
      /* ignore persistence errors */
    }
  }, []);

  const setTheme = useCallback((t) => { setThemeState(t); persist({ theme: t }); }, [persist]);
  const setAccent = useCallback((a) => { setAccentState(a); persist({ accentColor: a }); }, [persist]);
  const setCompact = useCallback((c) => { setCompactState(c); persist({ compactMode: c }); }, [persist]);

  const cycleTheme = useCallback(() => {
    const idx = THEMES.indexOf(theme);
    setTheme(THEMES[(idx + 1) % THEMES.length]);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{ theme, accent, compact, loaded, setTheme, setAccent, setCompact, cycleTheme, THEMES }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
