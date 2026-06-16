import React from 'react';
import Button from '../components/Button.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';

const THEME_ICON = { system: '🖥️', light: '☀️', dark: '🌙' };
const THEME_LABEL = { system: '系統', light: '淺色', dark: '深色' };

export default function Topbar({ title, onOpenPalette }) {
  const { theme, cycleTheme } = useTheme();
  return (
    <header className="topbar">
      <div className="tb-title">{title}</div>
      <div className="tb-actions">
        <Button variant="ghost" size="sm" icon="🔍" onClick={onOpenPalette} title="Command Palette (Ctrl+K)">
          指令
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={THEME_ICON[theme]}
          onClick={cycleTheme}
          title="切換主題 (系統 / 淺色 / 深色)"
        >
          {THEME_LABEL[theme]}
        </Button>
      </div>
    </header>
  );
}
