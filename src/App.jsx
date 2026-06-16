import React, { useEffect, useState } from 'react';
import AppShell from './layout/AppShell.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Modes from './pages/Modes.jsx';
import FileOrganizer from './pages/FileOrganizer.jsx';
import Automations from './pages/Automations.jsx';
import SystemMonitor from './pages/SystemMonitor.jsx';
import Screenshots from './pages/Screenshots.jsx';
import Rules from './pages/Rules.jsx';
import HealthMonitor from './pages/HealthMonitor.jsx';
import Settings from './pages/Settings.jsx';

function Shell() {
  const [page, setPage] = useState('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [externalModeResult, setExternalModeResult] = useState(null);

  useEffect(() => {
    if (!window.api) return undefined;
    const offNavigate = window.api.onNavigate((target) => {
      // 'downloads' from the tray maps to the Downloads (files) page.
      if (target === 'downloads') setPage('files');
      else if (target) setPage(target);
    });
    const offModeResult = window.api.onModeResult((result) => {
      setExternalModeResult(result);
      setPage('modes');
    });
    const offPalette = window.api.onOpenCommandPalette(() => setPaletteOpen(true));
    return () => {
      offNavigate && offNavigate();
      offModeResult && offModeResult();
      offPalette && offPalette();
    };
  }, []);

  // Ctrl+K and Ctrl+Shift+P open the command palette (renderer-side, when focused).
  useEffect(() => {
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'k' || (e.shiftKey && k === 'p'))) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = (key) => { setPage(key); setPaletteOpen(false); };

  const renderPage = () => {
    switch (page) {
      case 'projects': return <Projects />;
      case 'modes': return <Modes externalResult={externalModeResult} />;
      case 'files':
      case 'downloads': return <FileOrganizer />;
      case 'automations': return <Automations />;
      case 'monitor': return <SystemMonitor />;
      case 'screenshots': return <Screenshots />;
      case 'rules': return <Rules />;
      case 'health': return <HealthMonitor />;
      case 'settings': return <Settings />;
      case 'dashboard':
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <>
      <AppShell current={page} onNavigate={navigate} onOpenPalette={() => setPaletteOpen(true)}>
        {renderPage()}
      </AppShell>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </ThemeProvider>
  );
}
