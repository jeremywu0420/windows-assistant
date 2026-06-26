'use strict';

const projectService = require('./projectService');
const modeService = require('./modeService');

const STATIC_COMMANDS = [
  {
    id: 'nav.dashboard',
    title: '開啟每日工作台',
    hint: '首頁、健康分數、今日提醒',
    keywords: 'dashboard home 首頁 每日 工作台',
    action: { kind: 'navigate', page: 'dashboard' },
  },
  {
    id: 'nav.setup',
    title: '開啟設定精靈',
    hint: 'Downloads、Screenshots、VS Code、專案根目錄',
    keywords: 'setup wizard 設定 精靈 路徑',
    action: { kind: 'navigate', page: 'setup' },
  },
  {
    id: 'nav.files',
    title: '整理 Downloads',
    hint: '掃描並分類下載資料夾',
    keywords: 'downloads files 整理 下載 檔案',
    action: { kind: 'navigate', page: 'files' },
  },
  {
    id: 'nav.screenshots',
    title: '整理 Screenshots',
    hint: '截圖分類、日期、關鍵字',
    keywords: 'screenshots 截圖 整理',
    action: { kind: 'navigate', page: 'screenshots' },
  },
  {
    id: 'nav.cleanup',
    title: '開啟 Clean Center',
    hint: '暫存、快取、大檔案、重複檔案',
    keywords: 'cleanup clean center temp cache 清理',
    action: { kind: 'navigate', page: 'cleanup' },
  },
  {
    id: 'nav.automations',
    title: '開啟自動化',
    hint: 'When / Then 規則、檔案整理、截圖整理',
    keywords: 'automation 自動化 規則',
    action: { kind: 'navigate', page: 'automations' },
  },
  {
    id: 'nav.projects',
    title: '開啟 Project Hub',
    hint: '專案搜尋、Git 狀態、常用動作',
    keywords: 'projects hub 專案 git 搜尋',
    action: { kind: 'navigate', page: 'projects' },
  },
  {
    id: 'nav.templates',
    title: '建立工作區',
    hint: '語言模板、自訂混合模板',
    keywords: 'workspace templates 工作區 模板 語言',
    action: { kind: 'navigate', page: 'workspaceTemplates' },
  },
  {
    id: 'nav.modes',
    title: '開啟工作模式',
    hint: '一次開啟 App、資料夾、網址',
    keywords: 'modes 工作模式 vscode github',
    action: { kind: 'navigate', page: 'modes' },
  },
  {
    id: 'nav.monitor',
    title: '開啟系統監控',
    hint: 'CPU、RAM、Disk',
    keywords: 'monitor system cpu ram disk 監控',
    action: { kind: 'navigate', page: 'monitor' },
  },
  {
    id: 'nav.rules',
    title: '開啟智慧規則',
    hint: '健康提醒與條件規則',
    keywords: 'rules smart 智慧 規則',
    action: { kind: 'navigate', page: 'rules' },
  },
  {
    id: 'nav.health',
    title: '開啟健康檢查',
    hint: '系統健康、Git、磁碟提醒',
    keywords: 'health git 健康 檢查',
    action: { kind: 'navigate', page: 'health' },
  },
  {
    id: 'nav.cheatsheet',
    title: '開啟指令大全',
    hint: 'Git、npm、Python、各語言編譯指令查詢',
    keywords: 'cheatsheet command 指令 大全 git npm 編譯 compile',
    action: { kind: 'navigate', page: 'cheatsheet' },
  },
  {
    id: 'nav.settings',
    title: '開啟設定中心',
    hint: '路徑、啟動、外觀、匯入匯出',
    keywords: 'settings config 設定',
    action: { kind: 'navigate', page: 'settings' },
  },
];

function listCommands(config) {
  const commands = [...STATIC_COMMANDS];
  const projects = config && Array.isArray(config.projects) ? config.projects : [];
  const pinnedProjects =
    config && config.projectHub && Array.isArray(config.projectHub.pinnedProjects)
      ? config.projectHub.pinnedProjects
      : [];

  for (const project of pinnedProjects) {
    if (!project || !project.path) continue;
    const name = project.name || project.path;
    const common = {
      projectName: name,
      projectPath: project.path,
      isFile: !!project.isFile,
    };
    commands.push({
      id: `pinned.vscode.${project.path}`,
      title: `開啟釘選專案：${name}`,
      hint: project.path,
      keywords: `pinned pin favorite project vscode 釘選 專案 ${name} ${project.path}`,
      action: { kind: 'project', projectAction: 'openVSCode', ...common },
    });
    commands.push({
      id: `pinned.folder.${project.path}`,
      title: `開啟釘選資料夾：${name}`,
      hint: project.path,
      keywords: `pinned pin favorite folder 釘選 資料夾 ${name} ${project.path}`,
      action: { kind: 'project', projectAction: 'openFolder', ...common },
    });
  }

  for (const project of projects) {
    if (!project || !project.name || !project.path) continue;
    const common = {
      projectName: project.name,
      projectPath: project.path,
      isFile: !!project.isFile,
    };
    commands.push({
      id: `project.vscode.${project.path}`,
      title: `用 VS Code 開啟 ${project.name}`,
      hint: project.path,
      keywords: `project vscode code 專案 ${project.name} ${project.path} ${project.category || ''}`,
      action: { kind: 'project', projectAction: 'openVSCode', ...common },
    });
    commands.push({
      id: `project.folder.${project.path}`,
      title: `開啟資料夾 ${project.name}`,
      hint: project.path,
      keywords: `project folder explorer 資料夾 ${project.name} ${project.path}`,
      action: { kind: 'project', projectAction: 'openFolder', ...common },
    });
    commands.push({
      id: `project.terminal.${project.path}`,
      title: `開啟 Terminal ${project.name}`,
      hint: project.path,
      keywords: `project terminal cmd powershell 專案 ${project.name} ${project.path}`,
      action: { kind: 'project', projectAction: 'openTerminal', ...common },
    });
    if (project.hasDevScript) {
      commands.push({
        id: `project.dev.${project.path}`,
        title: `啟動 Dev Script ${project.name}`,
        hint: 'npm run dev',
        keywords: `project npm dev 專案 ${project.name} ${project.path}`,
        action: { kind: 'project', projectAction: 'runDev', ...common },
      });
    }
    if (project.isGitRepo) {
      commands.push({
        id: `project.git.${project.path}`,
        title: `檢查 Git 狀態 ${project.name}`,
        hint: project.path,
        keywords: `project git status 專案 ${project.name} ${project.path}`,
        action: { kind: 'project', projectAction: 'gitStatus', ...common },
      });
    }
  }

  for (const mode of modeService.listModes(config)) {
    commands.push({
      id: `mode.run.${mode.name}`,
      title: `啟動工作模式：${mode.name}`,
      hint: `${mode.apps.length} apps / ${mode.folders.length} folders / ${mode.urls.length} urls`,
      keywords: `mode 工作模式 ${mode.name}`,
      action: { kind: 'mode', modeName: mode.name },
    });
  }

  return commands;
}

async function runCommand(config, commandId) {
  const command = listCommands(config).find((item) => item.id === commandId);
  if (!command) return { ok: false, error: '找不到這個命令。' };

  const { action } = command;
  if (action.kind === 'navigate') return { ok: true, navigate: action.page };

  if (action.kind === 'project') {
    const result = await projectService.runAction(config, {
      projectName: action.projectName,
      projectPath: action.projectPath,
      isFile: action.isFile,
      action: action.projectAction,
    });
    return { ...result, navigate: 'projects' };
  }

  if (action.kind === 'mode') {
    const result = await modeService.runMode(config, action.modeName);
    return { ok: result.ok, message: `已執行工作模式：${result.mode}`, navigate: 'modes' };
  }

  return { ok: false, error: '不支援的命令類型。' };
}

module.exports = {
  listCommands,
  runCommand,
};
