import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const LocaleContext = createContext(null);

const resources = {
  en: {
    nav: {
      core: 'Core',
      tools: 'Tools',
      advanced: 'Advanced',
      dashboard: 'Dashboard',
      files: 'File Organizer',
      projects: 'Project Hub',
      cleanup: 'System Cleaner',
      monitor: 'Performance',
      automations: 'Automation',
      workflows: 'Workflows',
      settings: 'Settings',
      screenshots: 'Screenshot Organizer',
      workspaceTemplates: 'Workspace Templates',
      modes: 'Quick Modes',
      rules: 'Smart Rules',
      history: 'Recent Tasks',
      notifications: 'Notifications',
      health: 'Health Guard',
      toolchain: 'Toolchain Doctor',
      eeTools: 'EE Tools',
      embedded: 'Embedded Lab',
      cheatsheet: 'Command Cheatsheet',
      setup: 'Setup Wizard',
    },
    shell: {
      brandName: 'NEXUS',
      brandCaption: 'PC Life Assistant',
      systemStatus: 'System Status',
      monitoringActive: 'Monitoring active',
      monitoringPaused: 'Monitoring paused',
      watchedFolders: 'watched folder(s)',
      welcome: 'Welcome back',
      search: 'Search anything...',
      notifications: 'Notifications',
      settings: 'Settings',
      toggleTheme: 'Toggle theme',
      language: 'Language',
    },
    dashboard: {
      kicker: 'Dashboard',
      title: 'Welcome back',
      subtitle: 'Here is what is happening with your Windows workspace today.',
      refresh: 'Refresh data',
      refreshing: 'Refreshing...',
      updated: 'Updated',
      unavailable: 'Not available',
      systemStatus: 'System Status',
      tempUnavailable: 'Temp unavailable',
      totalFiles: 'Total Files',
      activeProjects: 'Active Projects',
      storageUsed: 'Storage Used',
      cacheSize: 'Cache Size',
      systemHealth: 'System Health',
      organizedToday: 'Organized Today',
      liveFolderScan: 'Live folder scan',
      gitReposDetected: 'Git repo(s) detected',
      runCleanScan: 'Run Clean Center scan',
      healthScore: 'Health score',
      activityHistory: 'From activity history',
      liveNodes: 'live nodes',
      good: 'Good',
      normal: 'Normal',
      attention: 'Attention',
      danger: 'Danger',
      dataUnavailableTitle: 'Dashboard data unavailable',
      unavailableFields: 'Unavailable live fields',
      open: 'Open',
      review: 'Review',
      liveSystem: 'System Overview',
      cleanupState: 'Cleanup State',
      memory: 'Memory',
      storage: 'Storage',
      network: 'Network',
      noNetwork: 'Unavailable from current backend',
      tempFiles: 'Temp Files',
      recycleBin: 'Recycle Bin',
      lastCleanup: 'Last Cleanup',
      recommendations: 'Recommendations',
      action: 'Action',
      clear: 'Clear',
      none: 'None',
      recentActivities: 'Recent Activities',
      viewAll: 'View All',
      noActivities: 'No recent activities',
      noActivitiesHint: 'Organizer and cleanup history will appear after real tasks run.',
      fileAnalytics: 'File Analytics',
      organize: 'Organize',
      storageDistribution: 'Storage Distribution',
      projectActivity: 'Project Activity',
      hub: 'Hub',
      aiAutomation: 'AI / Automation',
      rules: 'Rules',
      enabledRules: 'enabled rules',
      totalAutomationRules: 'total automation rule(s) configured.',
      noAutomationRules: 'No automation rules configured yet.',
      noProjects: 'No projects detected',
      noProjectsHint: 'Add scan roots in Project Hub to populate this area.',
      pinnedProjects: 'Pinned Projects',
      noPinnedProjects: 'No pinned projects',
      noPinnedProjectsHint: 'Pin projects in Project Hub to keep them here.',
      cpuCoreTemps: 'CPU Core Temperatures',
      noCpuTemps: 'No CPU core temperatures',
      noCpuTempsHint: 'Enable Core Temp, LibreHardwareMonitor, or OpenHardwareMonitor sensors.',
      recentActiveProjects: 'Recent Active Projects',
      notificationMessages: 'Notification Center',
      noNotifications: 'No notifications',
      noNotificationsHint: 'System and automation messages will appear here.',
      noClassifiedFiles: 'No classified files yet',
      noClassifiedHint: 'Folder scans returned no matching extension groups.',
      files: 'files',
      loadingNodes: 'Loading live nodes',
      type: 'Type',
      size: 'Size',
      status: 'Status',
    },
    settings: {
      languageLabel: 'Interface language',
      languageDesc:
        'Switch the redesigned dashboard and navigation between English and Traditional Chinese.',
      english: 'English',
      chinese: '繁體中文',
    },
  },
  zh: {
    nav: {
      core: '核心',
      tools: '工具',
      advanced: '進階',
      dashboard: '儀表板',
      files: '檔案整理',
      projects: '專案中心',
      cleanup: '系統清理',
      monitor: '效能監控',
      automations: '自動化',
      workflows: '視覺化自動化',
      settings: '設定',
      screenshots: '截圖整理',
      workspaceTemplates: '工作區範本',
      modes: '快速模式',
      rules: '智慧規則',
      history: '最近任務',
      notifications: '通知中心',
      health: '健康守護',
      toolchain: '工具鏈檢查',
      eeTools: '電子工具',
      embedded: '嵌入式實驗室',
      cheatsheet: '指令速查',
      setup: '設定精靈',
    },
    shell: {
      brandName: 'NEXUS',
      brandCaption: 'PC Life Assistant',
      systemStatus: '系統狀態',
      monitoringActive: '監控中',
      monitoringPaused: '監控暫停',
      watchedFolders: '個監控資料夾',
      welcome: '歡迎回來',
      search: '搜尋任何內容...',
      notifications: '通知',
      settings: '設定',
      toggleTheme: '切換主題',
      language: '語言',
    },
    dashboard: {
      kicker: 'Dashboard',
      title: '歡迎回來',
      subtitle: '這是今天 Windows 工作區、系統與自動化任務的即時概況。',
      refresh: '重新整理',
      refreshing: '更新中...',
      updated: '更新於',
      unavailable: '無法取得',
      systemStatus: '系統狀態',
      tempUnavailable: '暫存資料不可用',
      totalFiles: '檔案總數',
      activeProjects: '活躍專案',
      storageUsed: '儲存使用',
      cacheSize: '快取大小',
      systemHealth: '系統健康',
      organizedToday: '今日整理',
      liveFolderScan: '即時資料夾掃描',
      gitReposDetected: '個 Git repo',
      runCleanScan: '執行 Clean Center 掃描',
      healthScore: '健康分數',
      activityHistory: '來自活動紀錄',
      liveNodes: '個即時節點',
      good: '良好',
      normal: '正常',
      attention: '注意',
      danger: '危險',
      dataUnavailableTitle: 'Dashboard 資料無法取得',
      unavailableFields: '目前不可用的即時欄位',
      open: '開啟',
      review: '檢視',
      liveSystem: '系統總覽',
      cleanupState: '清理狀態',
      memory: '記憶體',
      storage: '儲存空間',
      network: '網路',
      noNetwork: '目前後端尚未提供',
      tempFiles: '暫存檔',
      recycleBin: '資源回收桶',
      lastCleanup: '上次清理',
      recommendations: '建議',
      action: '需處理',
      clear: '良好',
      none: '尚無',
      recentActivities: '最近活動',
      viewAll: '查看全部',
      noActivities: '尚無最近活動',
      noActivitiesHint: '檔案整理與清理任務執行後會顯示在這裡。',
      fileAnalytics: '檔案分析',
      organize: '整理',
      storageDistribution: '儲存分布',
      projectActivity: '專案活動',
      hub: '中心',
      aiAutomation: 'AI / 自動化',
      rules: '規則',
      enabledRules: '個啟用規則',
      totalAutomationRules: '個自動化規則已設定。',
      noAutomationRules: '尚未設定自動化規則。',
      noProjects: '尚未偵測到專案',
      noProjectsHint: '請在 Project Hub 加入掃描根目錄。',
      pinnedProjects: '釘選專案',
      noPinnedProjects: '尚無釘選專案',
      noPinnedProjectsHint: '到 Project Hub 釘選專案後會顯示在這裡。',
      cpuCoreTemps: 'CPU 各核溫度',
      noCpuTemps: '尚無 CPU 各核溫度',
      noCpuTempsHint: '請啟用 Core Temp、LibreHardwareMonitor 或 OpenHardwareMonitor 感測器。',
      recentActiveProjects: '最近活躍專案',
      notificationMessages: '通知中心訊息',
      noNotifications: '尚無通知',
      noNotificationsHint: '系統與自動化通知會顯示在這裡。',
      noClassifiedFiles: '尚無分類檔案',
      noClassifiedHint: '資料夾掃描沒有找到符合的副檔名分類。',
      files: '個檔案',
      loadingNodes: '載入即時節點',
      type: '類型',
      size: '容量',
      status: '狀態',
    },
    settings: {
      languageLabel: '介面語言',
      languageDesc: '切換新版 Dashboard 與導覽列的中文或英文版本。',
      english: 'English',
      chinese: '繁體中文',
    },
  },
};

function browserDefault() {
  return String(navigator.language || '')
    .toLowerCase()
    .startsWith('zh')
    ? 'zh'
    : 'en';
}

function lookup(language, key) {
  return (
    key
      .split('.')
      .reduce((obj, part) => (obj && obj[part] != null ? obj[part] : null), resources[language]) ??
    key
      .split('.')
      .reduce((obj, part) => (obj && obj[part] != null ? obj[part] : null), resources.en) ??
    key
  );
}

export function LocaleProvider({ children }) {
  const [language, setLanguageState] = useState(browserDefault());

  useEffect(() => {
    if (!window.api?.getSettings) return;
    window.api
      .getSettings()
      .then((result) => {
        const value = result?.settings?.general?.language;
        if (value === 'zh' || value === 'en') setLanguageState(value);
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback(async (nextLanguage) => {
    const safeLanguage = nextLanguage === 'zh' ? 'zh' : 'en';
    setLanguageState(safeLanguage);
    if (!window.api?.getSettings || !window.api?.saveSettings) return;
    try {
      const result = await window.api.getSettings();
      const settings = result.settings || {};
      await window.api.saveSettings({
        ...settings,
        general: {
          ...(settings.general || {}),
          language: safeLanguage,
        },
      });
    } catch (_) {
      /* keep the in-memory language even if persistence fails */
    }
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key) => lookup(language, key),
    }),
    [language, setLanguage],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext) || { language: 'en', setLanguage: () => {}, t: (key) => key };
}
