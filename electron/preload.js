'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure bridge between the React renderer and the Node.js/Electron main process.
 * The renderer never touches Node APIs directly — it only calls these methods.
 */
contextBridge.exposeInMainWorld('api', {
  // System / health
  getSystemStatus: () => ipcRenderer.invoke('system:getStatus'),

  // Quick modes
  listModes: () => ipcRenderer.invoke('mode:list'),
  runMode: (modeName) => ipcRenderer.invoke('mode:run', modeName),

  // Downloads / file organizer
  scanDownloads: () => ipcRenderer.invoke('files:scan'),
  organizeFiles: (items) => ipcRenderer.invoke('files:organize', items),
  detectDownloads: () => ipcRenderer.invoke('downloads:detect'),
  undoOrganize: () => ipcRenderer.invoke('downloads:undo'),
  openDownloadsFolder: () => ipcRenderer.invoke('downloads:openFolder'),

  // Monitoring
  getMonitorState: () => ipcRenderer.invoke('monitor:getState'),
  setMonitorPaused: (value) => ipcRenderer.invoke('monitor:setPaused', value),
  restartMonitor: () => ipcRenderer.invoke('monitor:restart'),

  // Automations
  listAutomations: () => ipcRenderer.invoke('automations:list'),
  saveAutomations: (automations) => ipcRenderer.invoke('automations:save', automations),

  // Notifications
  testNotification: () => ipcRenderer.invoke('notifications:test'),

  // Git
  checkGit: () => ipcRenderer.invoke('git:check'),

  // Project Hub
  listProjects: () => ipcRenderer.invoke('project:list'),
  runProjectAction: (payload) => ipcRenderer.invoke('project:action', payload),

  // Command Palette
  listCommands: () => ipcRenderer.invoke('command:list'),
  runCommand: (commandId) => ipcRenderer.invoke('command:run', commandId),

  // Smart Rules
  getRules: () => ipcRenderer.invoke('rules:get'),
  saveRules: (rules) => ipcRenderer.invoke('rules:save', rules),

  // Screenshot Organizer
  scanScreenshots: () => ipcRenderer.invoke('screenshots:scan'),
  organizeScreenshots: (items) => ipcRenderer.invoke('screenshots:organize', items),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  openSettingsFile: () => ipcRenderer.invoke('settings:openFile'),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  openLogs: () => ipcRenderer.invoke('logs:open'),

  // VS Code path
  detectVSCode: () => ipcRenderer.invoke('vscode:detect'),
  pickVSCodeFile: () => ipcRenderer.invoke('dialog:pickVSCode'),
  testVSCode: () => ipcRenderer.invoke('vscode:test'),

  // Generic pickers / validation (used by the Mode editor)
  pickPath: (opts) => ipcRenderer.invoke('dialog:pickPath', opts),
  pathInfo: (p) => ipcRenderer.invoke('fs:pathInfo', p),

  // Start at login
  getAutoLaunch: () => ipcRenderer.invoke('autolaunch:get'),
  setAutoLaunch: (value) => ipcRenderer.invoke('autolaunch:set', value),

  // Misc
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  minimizeToTray: () => ipcRenderer.invoke('app:minimizeToTray'),

  // Main -> renderer events
  onNavigate: (callback) => {
    const handler = (_event, page) => callback(page);
    ipcRenderer.on('app:navigate', handler);
    return () => ipcRenderer.removeListener('app:navigate', handler);
  },
  onModeResult: (callback) => {
    const handler = (_event, result) => callback(result);
    ipcRenderer.on('app:mode-result', handler);
    return () => ipcRenderer.removeListener('app:mode-result', handler);
  },
  onOpenCommandPalette: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:open-command-palette', handler);
    return () => ipcRenderer.removeListener('app:open-command-palette', handler);
  },
  onFileEvent: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('app:file-event', handler);
    return () => ipcRenderer.removeListener('app:file-event', handler);
  },
  onMonitoringChanged: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('app:monitoring-changed', handler);
    return () => ipcRenderer.removeListener('app:monitoring-changed', handler);
  },
});
