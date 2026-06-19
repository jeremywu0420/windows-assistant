'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const cleanupApi = {
  scan: (payload) => ipcRenderer.invoke('cleanup:scan', payload),
  cleanSelected: (payload) => ipcRenderer.invoke('cleanup:cleanSelected', payload),
  getLogs: () => ipcRenderer.invoke('cleanup:getLogs'),
  openLogFile: () => ipcRenderer.invoke('cleanup:openLogFile'),
  clearLogs: () => ipcRenderer.invoke('cleanup:clearLogs'),
  exportLogs: (format) => ipcRenderer.invoke('cleanup:exportLogs', format),
  getSettings: () => ipcRenderer.invoke('cleanup:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('cleanup:saveSettings', settings),
  getStatus: () => ipcRenderer.invoke('cleanup:status'),
  getSummary: () => ipcRenderer.invoke('cleanup:getSummary'),
  getIgnoreList: () => ipcRenderer.invoke('cleanup:getIgnoreList'),
  addIgnoreItem: (item) => ipcRenderer.invoke('cleanup:addIgnoreItem', item),
  removeIgnoreItem: (id) => ipcRenderer.invoke('cleanup:removeIgnoreItem', id),
  getDiskUsage: (drivePath) => ipcRenderer.invoke('cleanup:getDiskUsage', drivePath),
  getRecommendations: (payload) => ipcRenderer.invoke('cleanup:getRecommendations', payload),
  runAutomationAction: (type, options) => ipcRenderer.invoke('cleanup:automationAction', type, options),
  getRecycleBin: () => ipcRenderer.invoke('cleanup:recycleBin'),
  emptyRecycleBin: () => ipcRenderer.invoke('cleanup:emptyRecycleBin'),
  getStartupItems: () => ipcRenderer.invoke('cleanup:startupItems'),
  openPath: (targetPath) => ipcRenderer.invoke('cleanup:openPath', targetPath),
};

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
  getDownloadsDefaultPath: () => ipcRenderer.invoke('downloads:getDefaultPath'),
  selectDownloadsFolder: () => ipcRenderer.invoke('downloads:selectFolder'),
  scanDownloadsFolder: (payload) => ipcRenderer.invoke('downloads:scan', payload),
  organizeDownloads: (payload) => ipcRenderer.invoke('downloads:organize', payload),
  restoreLastDownloadsOrganize: () => ipcRenderer.invoke('downloads:restoreLast'),
  getDownloadsSettings: () => ipcRenderer.invoke('downloads:getSettings'),
  saveDownloadsSettings: (settings) => ipcRenderer.invoke('downloads:saveSettings', settings),
  getDownloadsHistory: () => ipcRenderer.invoke('downloads:getHistory'),
  openDownloadsHistory: () => ipcRenderer.invoke('downloads:openHistory'),

  // Monitoring
  getMonitorState: () => ipcRenderer.invoke('monitor:getState'),
  setMonitorPaused: (value) => ipcRenderer.invoke('monitor:setPaused', value),
  restartMonitor: () => ipcRenderer.invoke('monitor:restart'),

  // Automations
  listAutomations: () => ipcRenderer.invoke('automations:list'),
  saveAutomations: (automations) => ipcRenderer.invoke('automations:save', automations),
  runAutomation: (ruleId) => ipcRenderer.invoke('automations:run', ruleId),

  // Notifications
  testNotification: () => ipcRenderer.invoke('notifications:test'),
  listNotifications: () => ipcRenderer.invoke('notifications:list'),
  markNotificationRead: (id) => ipcRenderer.invoke('notifications:markRead', id),
  clearNotifications: () => ipcRenderer.invoke('notifications:clear'),

  // Activity History / Restore Center
  listActivityHistory: () => ipcRenderer.invoke('history:list'),
  restoreDownloadsLastFromHistory: () => ipcRenderer.invoke('history:restoreDownloadsLast'),

  // Health Guard
  getHealthGuard: () => ipcRenderer.invoke('healthGuard:get'),
  saveHealthGuard: (patch) => ipcRenderer.invoke('healthGuard:save', patch),
  checkHealthGuardNow: () => ipcRenderer.invoke('healthGuard:checkNow'),

  // Git
  checkGit: () => ipcRenderer.invoke('git:check'),

  // Toolchain Doctor
  checkToolchains: () => ipcRenderer.invoke('toolchain:check'),

  // Build (compile / simulate)
  detectBuild: (folderPath) => ipcRenderer.invoke('build:detect', folderPath),
  runBuild: (folderPath) => ipcRenderer.invoke('build:run', folderPath),
  cancelBuild: () => ipcRenderer.invoke('build:cancel'),

  // Serial Monitor
  listSerialPorts: () => ipcRenderer.invoke('serial:listPorts'),
  openSerial: (payload) => ipcRenderer.invoke('serial:open', payload),
  closeSerial: () => ipcRenderer.invoke('serial:close'),

  // Project Hub
  listProjects: () => ipcRenderer.invoke('project:list'),
  runProjectAction: (payload) => ipcRenderer.invoke('project:action', payload),
  getProjectScanStatus: () => ipcRenderer.invoke('project:scanStatus'),
  cancelProjectScan: () => ipcRenderer.invoke('project:cancelScan'),
  getProjectHubSettings: () => ipcRenderer.invoke('project:getHubSettings'),
  saveProjectHubSettings: (projectHub) => ipcRenderer.invoke('project:saveHubSettings', projectHub),
  addProjectScanRoot: (folderPath) => ipcRenderer.invoke('project:addScanRoot', folderPath),
  removeProjectScanRoot: (folderPath) => ipcRenderer.invoke('project:removeScanRoot', folderPath),
  excludeProjectFolder: (folderPath) => ipcRenderer.invoke('project:excludeFolder', folderPath),
  getProjectFolderSize: (folderPath) => ipcRenderer.invoke('project:folderSize', folderPath),
  createProjectFromTemplate: (payload) => ipcRenderer.invoke('project:createFromTemplate', payload),

  // Command Palette
  listCommands: () => ipcRenderer.invoke('command:list'),
  runCommand: (commandId) => ipcRenderer.invoke('command:run', commandId),

  // Smart Rules
  getRules: () => ipcRenderer.invoke('rules:get'),
  saveRules: (rules) => ipcRenderer.invoke('rules:save', rules),

  // Clean Center
  cleanup: cleanupApi,

  // Screenshot Organizer
  getScreenshotSettings: () => ipcRenderer.invoke('screenshots:getSettings'),
  updateScreenshotSettings: (settings) => ipcRenderer.invoke('screenshots:updateSettings', settings),
  scanScreenshots: (payload) => ipcRenderer.invoke('screenshots:scan', payload),
  organizeScreenshots: (payload) => ipcRenderer.invoke('screenshots:organize', payload),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getSetupStatus: () => ipcRenderer.invoke('settings:getSetupStatus'),
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

  // App updates
  getUpdateStatus: () => ipcRenderer.invoke('updates:getStatus'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),

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
  onBuildOutput: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('app:build-output', handler);
    return () => ipcRenderer.removeListener('app:build-output', handler);
  },
  onSerialData: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('app:serial-data', handler);
    return () => ipcRenderer.removeListener('app:serial-data', handler);
  },
  onMonitoringChanged: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('app:monitoring-changed', handler);
    return () => ipcRenderer.removeListener('app:monitoring-changed', handler);
  },
  onUpdateEvent: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('app:update-event', handler);
    return () => ipcRenderer.removeListener('app:update-event', handler);
  },
  onAutomationFired: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('app:automation-fired', handler);
    return () => ipcRenderer.removeListener('app:automation-fired', handler);
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  cleanup: cleanupApi,
});
