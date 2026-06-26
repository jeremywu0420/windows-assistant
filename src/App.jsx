import React, { useEffect, useState } from 'react';
import AppShell from './layout/AppShell.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { LocaleProvider } from './i18n.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Modes from './pages/Modes.jsx';
import FileOrganizer from './pages/FileOrganizer.jsx';
import Automations from './pages/Automations.jsx';
import WorkflowEditor from './pages/WorkflowEditor.tsx';
import SystemMonitor from './pages/SystemMonitor.jsx';
import Screenshots from './pages/Screenshots.jsx';
import Rules from './pages/Rules.jsx';
import HealthMonitor from './pages/HealthMonitor.jsx';
import SecurityCenter from './pages/SecurityCenter.tsx';
import Settings from './pages/Settings.jsx';
import CleanCenter from './pages/CleanCenter.jsx';
import SetupWizard from './pages/SetupWizard.jsx';
import WorkspaceTemplates from './pages/WorkspaceTemplates.jsx';
import NotificationCenter from './pages/NotificationCenter.jsx';
import ActivityHistory from './pages/ActivityHistory.jsx';
import CommandCheatsheet from './pages/CommandCheatsheet.jsx';
import ToolchainDoctor from './pages/ToolchainDoctor.jsx';
import EETools from './pages/EETools.jsx';
import EmbeddedLab from './pages/EmbeddedLab.jsx';
import OverlayApp from './overlay/OverlayApp.jsx';

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

  useEffect(() => {
    if (!window.api?.getSetupStatus) return;
    window.api
      .getSetupStatus()
      .then((result) => {
        if (result?.ok && !result.complete) setPage('setup');
      })
      .catch(() => {});
  }, []);

  // Ctrl+K and Ctrl+Alt+Shift+N open the command palette (renderer-side, when focused).
  useEffect(() => {
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      const commandSearch = (e.ctrlKey || e.metaKey) && k === 'k';
      const globalPalette = (e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && k === 'n';
      if (commandSearch || globalPalette) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = (key) => {
    setPage(key);
    setPaletteOpen(false);
  };

  const renderPage = () => {
    switch (page) {
      case 'projects':
        return <Projects onNavigate={navigate} />;
      case 'modes':
        return <Modes externalResult={externalModeResult} />;
      case 'files':
      case 'downloads':
        return <FileOrganizer />;
      case 'cleanup':
        return <CleanCenter />;
      case 'setup':
        return <SetupWizard onNavigate={navigate} />;
      case 'workspaceTemplates':
        return <WorkspaceTemplates onNavigate={navigate} />;
      case 'cheatsheet':
        return <CommandCheatsheet />;
      case 'toolchain':
        return <ToolchainDoctor />;
      case 'eeTools':
        return <EETools />;
      case 'embedded':
        return <EmbeddedLab />;
      case 'automations':
        return <Automations onNavigate={navigate} />;
      case 'workflows':
        return <WorkflowEditor onNavigate={navigate} />;
      case 'monitor':
        return <SystemMonitor onNavigate={navigate} />;
      case 'screenshots':
        return <Screenshots />;
      case 'rules':
        return <Rules />;
      case 'security':
        return <SecurityCenter />;
      case 'health':
        return <HealthMonitor />;
      case 'notifications':
        return <NotificationCenter onNavigate={navigate} />;
      case 'history':
        return <ActivityHistory />;
      case 'settings':
        return <Settings />;
      case 'dashboard':
      default:
        return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <>
      <AppShell current={page} onNavigate={navigate} onOpenPalette={() => setPaletteOpen(true)}>
        {renderPage()}
      </AppShell>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
      />
    </>
  );
}

export default function App() {
  const isOverlay =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('overlay') === '1';

  if (isOverlay) {
    return <OverlayApp />;
  }

  return (
    <ThemeProvider>
      <LocaleProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
