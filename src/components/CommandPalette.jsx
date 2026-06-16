import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { useToast } from './Toast.jsx';

/**
 * Command Palette (Ctrl+K / Ctrl+Shift+P).
 * Combines local actions (navigation, theme, monitoring, downloads) with
 * backend project/mode commands from the main-process registry.
 */
export default function CommandPalette({ open, onClose, onNavigate }) {
  const { cycleTheme } = useTheme();
  const { toast } = useToast();
  const [commands, setCommands] = useState([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const localCommands = useMemo(
    () => [
      { id: 'l.dashboard', title: 'Open Dashboard', hint: '首頁總覽', run: () => onNavigate('dashboard') },
      { id: 'l.organize', title: 'Organize Downloads', hint: '整理下載資料夾', run: () => onNavigate('files') },
      {
        id: 'l.openDownloads',
        title: 'Open Downloads Folder',
        hint: '在檔案總管開啟',
        run: async () => {
          const r = await window.api.openDownloadsFolder();
          toast(r.ok ? '已開啟 Downloads 資料夾' : r.error || '開啟失敗', r.ok ? 'ok' : 'error');
        },
      },
      { id: 'l.newAutomation', title: 'New Automation', hint: '新增自動化規則', run: () => onNavigate('automations') },
      {
        id: 'l.toggleMonitor',
        title: 'Toggle Monitoring',
        hint: '暫停 / 恢復檔案監控',
        run: async () => {
          const s = await window.api.getMonitorState();
          const r = await window.api.setMonitorPaused(!s.paused);
          toast(r.paused ? '已暫停監控' : '已恢復監控', 'ok');
        },
      },
      { id: 'l.settings', title: 'Open Settings', hint: '設定中心', run: () => onNavigate('settings') },
      { id: 'l.theme', title: 'Switch Theme', hint: '系統 / 淺色 / 深色', run: () => cycleTheme() },
      { id: 'l.monitor', title: 'Open System Monitor', hint: 'CPU / RAM / Disk', run: () => onNavigate('monitor') },
    ],
    [onNavigate, cycleTheme, toast]
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    // Append backend project/mode commands.
    if (window.api) {
      window.api.listCommands().then((res) => {
        const backend = (res.commands || [])
          .filter((c) => c.id.startsWith('project.') || c.id.startsWith('mode.'))
          .map((c) => ({
            id: c.id,
            title: c.title,
            hint: c.hint,
            run: async () => {
              const r = await window.api.runCommand(c.id);
              if (r && r.navigate) onNavigate(r.navigate);
              if (r && !r.ok && r.error) toast(r.error, 'error');
            },
          }));
        setCommands([...localCommands, ...backend]);
      });
    } else {
      setCommands(localCommands);
    }
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
    return () => clearTimeout(t);
  }, [open, localCommands, onNavigate, toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      q.split(/\s+/).every((tok) => `${c.title} ${c.hint || ''}`.toLowerCase().includes(tok))
    );
  }, [commands, query]);

  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered, active]);

  const run = async (c) => {
    if (!c) return;
    onClose();
    try {
      await c.run();
    } catch (err) {
      toast(err.message || '執行失敗', 'error');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[active]); }
  };

  if (!open) return null;

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="輸入指令… (↑ ↓ 選擇，Enter 執行，Esc 關閉)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        />
        <ul className="palette-list">
          {filtered.length === 0 ? (
            <li className="palette-empty">沒有符合的指令</li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.id}
                className={`palette-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(c)}
              >
                <span className="palette-title">{c.title}</span>
                {c.hint ? <span className="palette-hint">{c.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
