import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { useToast } from './Toast.jsx';

const PAGE_COMMANDS = [
  {
    id: 'page.dashboard',
    title: '前往每日工作台',
    hint: '健康分數、快速操作、溫度、磁碟與提醒',
    page: 'dashboard',
    group: '頁面',
    keywords: ['home', 'dashboard', '工作台'],
  },
  {
    id: 'page.notifications',
    title: '前往通知中心',
    hint: '健康守護、自動化、清理與更新通知',
    page: 'notifications',
    group: '頁面',
    keywords: ['通知', 'notification'],
  },
  {
    id: 'page.history',
    title: '前往活動與復原',
    hint: '整理歷史、清理紀錄、可復原操作',
    page: 'history',
    group: '頁面',
    keywords: ['history', '復原', 'restore'],
  },
  {
    id: 'page.setup',
    title: '前往設定精靈',
    hint: '確認 Downloads、Screenshots、VS Code 與專案根目錄',
    page: 'setup',
    group: '頁面',
    keywords: ['setup', '設定'],
  },
  {
    id: 'page.files',
    title: '前往檔案整理',
    hint: '整理 Downloads 檔案',
    page: 'files',
    group: '頁面',
    keywords: ['downloads', '檔案'],
  },
  {
    id: 'page.screenshots',
    title: '前往截圖整理',
    hint: '依日期與分類整理截圖',
    page: 'screenshots',
    group: '頁面',
    keywords: ['screenshot', '截圖'],
  },
  {
    id: 'page.cleanup',
    title: '前往 Clean Center',
    hint: '安全掃描暫存、快取、大檔與重複檔',
    page: 'cleanup',
    group: '頁面',
    keywords: ['cleanup', 'clean', '清理'],
  },
  {
    id: 'page.automations',
    title: '前往自動化',
    hint: '新檔案觸發與排程觸發規則',
    page: 'automations',
    group: '頁面',
    keywords: ['automation', '自動化', '排程'],
  },
  {
    id: 'page.projects',
    title: '前往 Project Hub',
    hint: '專案搜尋、Git 狀態與常用動作',
    page: 'projects',
    group: '頁面',
    keywords: ['project', 'git'],
  },
  {
    id: 'page.templates',
    title: '前往工作區模板',
    hint: '建立程式語言與混合語言工作區',
    page: 'workspaceTemplates',
    group: '頁面',
    keywords: ['template', 'workspace', '模板'],
  },
  {
    id: 'page.modes',
    title: '前往工作模式',
    hint: '一次開啟 VS Code、資料夾、GitHub 與指令',
    page: 'modes',
    group: '頁面',
    keywords: ['mode', '工作模式'],
  },
  {
    id: 'page.monitor',
    title: '前往系統監控',
    hint: 'CPU、RAM、磁碟與感測器',
    page: 'monitor',
    group: '頁面',
    keywords: ['monitor', 'system'],
  },
  {
    id: 'page.health',
    title: '前往健康檢查',
    hint: 'App 自我診斷與系統檢查',
    page: 'health',
    group: '頁面',
    keywords: ['health', '診斷'],
  },
  {
    id: 'page.settings',
    title: '前往設定中心',
    hint: '路徑、開機喚醒、健康守護、清理與備份',
    page: 'settings',
    group: '頁面',
    keywords: ['settings', '設定'],
  },
];

const GROUP_ORDER = ['動作', '頁面', '專案', '工作模式'];

function getGroupRank(group) {
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function scoreCommand(command, tokens) {
  if (!tokens.length) return command.priority || 0;
  const title = normalizeText(command.title);
  const group = normalizeText(command.group);
  const hint = normalizeText(command.hint);
  const keywords = normalizeText((command.keywords || []).join(' '));
  const haystack = `${title} ${group} ${hint} ${keywords}`;
  let score = command.priority || 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) return -1;
    if (title.startsWith(token)) score += 40;
    else if (title.includes(token)) score += 24;
    else if (keywords.includes(token)) score += 16;
    else if (group.includes(token)) score += 10;
    else score += 4;
  }
  return score;
}

function groupCommands(items) {
  const groups = new Map();
  for (const item of items) {
    const group = item.group || '其他';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  return [...groups.entries()].sort(
    ([a], [b]) => getGroupRank(a) - getGroupRank(b) || a.localeCompare(b, 'zh-Hant'),
  );
}

export default function CommandPalette({ open, onClose, onNavigate }) {
  const { cycleTheme } = useTheme();
  const { toast } = useToast();
  const [backendCommands, setBackendCommands] = useState([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const localCommands = useMemo(
    () => [
      {
        id: 'action.organizeDownloads',
        title: '整理 Downloads',
        hint: '前往檔案整理頁掃描與整理',
        group: '動作',
        keywords: ['downloads', '整理'],
        priority: 20,
        run: () => onNavigate('files'),
      },
      {
        id: 'action.organizeScreenshots',
        title: '整理截圖',
        hint: '前往截圖整理頁',
        group: '動作',
        keywords: ['screenshot', '截圖'],
        priority: 20,
        run: () => onNavigate('screenshots'),
      },
      {
        id: 'action.scanCleanup',
        title: '掃描 Clean Center',
        hint: '檢查暫存、快取、大檔與重複檔案',
        group: '動作',
        keywords: ['cleanup', 'clean', '清理'],
        priority: 18,
        run: () => onNavigate('cleanup'),
      },
      {
        id: 'action.notifications',
        title: '查看通知中心',
        hint: '查看健康守護與自動化通知',
        group: '動作',
        keywords: ['notification', '通知'],
        priority: 17,
        run: () => onNavigate('notifications'),
      },
      {
        id: 'action.history',
        title: '查看活動與復原',
        hint: '查看整理歷史並復原上次 Downloads 整理',
        group: '動作',
        keywords: ['history', 'restore', '復原'],
        priority: 17,
        run: () => onNavigate('history'),
      },
      {
        id: 'action.healthCheck',
        title: '立即健康守護檢查',
        hint: '檢查溫度、RAM 與磁碟門檻',
        group: '動作',
        keywords: ['health', 'temperature', '健康'],
        run: async () => {
          const result = await window.api.checkHealthGuardNow();
          toast(
            result.ok
              ? `檢查完成，觸發 ${result.fired?.length || 0} 個通知`
              : result.error || '檢查失敗',
            result.ok ? 'ok' : 'error',
          );
        },
      },
      {
        id: 'action.toggleMonitor',
        title: '暫停/恢復監控',
        hint: '切換背景資料夾監控狀態',
        group: '動作',
        keywords: ['monitor', 'pause', 'resume'],
        run: async () => {
          const state = await window.api.getMonitorState();
          const result = await window.api.setMonitorPaused(!state.paused);
          toast(result.paused ? '監控已暫停' : '監控已恢復', 'ok');
        },
      },
      {
        id: 'action.theme',
        title: '切換深色/淺色主題',
        hint: '循環切換系統、淺色、深色',
        group: '動作',
        keywords: ['theme', 'dark', 'light'],
        run: () => {
          cycleTheme();
          toast('已切換主題', 'ok');
        },
      },
      ...PAGE_COMMANDS.map((command) => ({ ...command, run: () => onNavigate(command.page) })),
    ],
    [onNavigate, cycleTheme, toast],
  );

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setQuery('');
    setActive(0);
    setLoading(true);
    if (window.api?.listCommands) {
      window.api
        .listCommands()
        .then((res) => {
          if (cancelled) return;
          const remote = (res.commands || [])
            .filter(
              (command) =>
                command.id.startsWith('project.') ||
                command.id.startsWith('pinned.') ||
                command.id.startsWith('mode.'),
            )
            .map((command) => ({
              id: command.id,
              title: command.title,
              hint: command.hint,
              group: command.id.startsWith('mode.') ? '工作模式' : '專案',
              keywords: [command.title, command.hint, command.id],
              run: async () => {
                const result = await window.api.runCommand(command.id);
                if (result?.navigate) onNavigate(result.navigate);
                if (result?.ok) toast(command.title, 'ok');
                if (result && !result.ok && result.error) toast(result.error, 'error');
              },
            }));
          setBackendCommands(remote);
        })
        .catch((err) => {
          if (!cancelled) toast(err.message || '載入命令失敗', 'error');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setBackendCommands([]);
      setLoading(false);
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, onNavigate, toast]);

  const commands = useMemo(() => {
    const seen = new Set();
    return [...localCommands, ...backendCommands].filter((command) => {
      if (seen.has(command.id)) return false;
      seen.add(command.id);
      return true;
    });
  }, [localCommands, backendCommands]);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return commands
      .map((command) => ({ command, score: scoreCommand(command, tokens) }))
      .filter((item) => item.score >= 0)
      .sort(
        (a, b) =>
          b.score - a.score || getGroupRank(a.command.group) - getGroupRank(b.command.group),
      )
      .map((item) => item.command);
  }, [commands, query]);

  const grouped = useMemo(() => groupCommands(filtered), [filtered]);

  useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(filtered.length - 1, 0));
  }, [filtered, active]);

  const run = async (command) => {
    if (!command) return;
    onClose();
    try {
      await command.run();
    } catch (err) {
      toast(err.message || '執行命令失敗', 'error');
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(filtered[active]);
    }
  };

  if (!open) return null;
  let runningIndex = -1;

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div
        className="palette command-palette"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="palette-search-row">
          <span className="palette-search-icon">SE</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="搜尋頁面、專案、設定、清理、通知或動作"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
          />
          <span className="palette-shortcut">Enter</span>
        </div>
        <div className="palette-meta">
          <span>{filtered.length} 個結果</span>
          <span>方向鍵選擇</span>
          <span>Esc 關閉</span>
        </div>
        <div className="palette-list" role="listbox">
          {loading ? <div className="palette-empty">載入可用命令...</div> : null}
          {!loading && filtered.length === 0 ? (
            <div className="palette-empty">找不到符合的命令</div>
          ) : null}
          {!loading &&
            grouped.map(([group, items]) => (
              <section key={group} className="palette-group">
                <div className="palette-group-title">{group}</div>
                {items.map((command) => {
                  runningIndex += 1;
                  const isActive = runningIndex === active;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      className={`palette-item ${isActive ? 'active' : ''}`}
                      onMouseEnter={() => setActive(runningIndex)}
                      onClick={() => run(command)}
                      role="option"
                      aria-selected={isActive}
                    >
                      <span className="palette-title">{command.title}</span>
                      <span className="palette-hint">{command.hint || command.group}</span>
                    </button>
                  );
                })}
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
