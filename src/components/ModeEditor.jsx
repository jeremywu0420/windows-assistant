import React, { useEffect, useMemo, useState } from 'react';
import Button from './Button.jsx';
import StatusBadge from './StatusBadge.jsx';

const inputStyle = {
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
};

const pathInputStyle = {
  ...inputStyle,
  flex: 1,
  minWidth: 190,
  fontFamily: '"Cascadia Code","Consolas",monospace',
};

function emptyMode() {
  return { name: 'New Work Mode', apps: [], folders: [], urls: [], commands: [] };
}

// EE 工作模式範本：一鍵預填常見電機/電子工作情境。
// App 路徑刻意留空，使用者用「選擇」指向自己機器上的 exe；空白資料夾/App 在儲存時會被濾除。
const MODE_PRESETS = [
  {
    name: 'PCB 設計模式',
    apps: [{ path: '', name: 'KiCad', icon: 'PCB', workspaceFolder: '' }],
    folders: ['', ''],
    urls: [],
    commands: [],
  },
  {
    name: 'FPGA 模式',
    apps: [{ path: '', name: 'Quartus / Vivado', icon: 'FPGA', workspaceFolder: '' }],
    folders: [''],
    urls: [],
    commands: [],
  },
  {
    name: '嵌入式模式',
    apps: [{ path: '', name: 'Arduino IDE / STM32CubeIDE', icon: 'MCU', workspaceFolder: '' }],
    folders: [''],
    urls: [],
    commands: [],
  },
  {
    name: '模擬模式',
    apps: [{ path: '', name: 'LTspice', icon: 'SIM', workspaceFolder: '' }],
    folders: [''],
    urls: [],
    commands: [],
  },
];

function normApp(app) {
  if (typeof app === 'string') return { path: app, name: '', icon: '', workspaceFolder: '' };
  if (app && typeof app === 'object') {
    return {
      path: app.path || '',
      name: app.name || '',
      icon: app.icon || '',
      workspaceFolder: app.workspaceFolder || '',
    };
  }
  return { path: '', name: '', icon: '', workspaceFolder: '' };
}

function denormApp(app) {
  const pathValue = (app.path || '').trim();
  const payload = {
    path: pathValue,
    name: (app.name || '').trim(),
    icon: (app.icon || '').trim(),
    workspaceFolder: (app.workspaceFolder || '').trim(),
  };
  if (payload.name || payload.icon || payload.workspaceFolder) return payload;
  return pathValue;
}

function normMode(mode) {
  return {
    name: mode.name || '',
    apps: (mode.apps || []).map(normApp),
    folders: [...(mode.folders || [])],
    urls: [...(mode.urls || [])],
    commands: (mode.commands || []).map((command) => ({
      cwd: command.cwd || '',
      command: command.command || '',
    })),
  };
}

function uniqueName(base, modes) {
  const names = new Set(modes.map((mode) => mode.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function ListSection({ title, description, children, action }) {
  return (
    <div className="editor-section">
      <div className="row-between">
        <div>
          <div className="section-title">{title}</div>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function ModeEditor({ onSaved }) {
  const [modes, setModes] = useState([]);
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pathChecks, setPathChecks] = useState({});

  const mode = modes[selected];

  const validate = async (pathValue) => {
    const trimmed = (pathValue || '').trim();
    if (!window.api || !trimmed) return;
    const info = await window.api.pathInfo(trimmed);
    setPathChecks((previous) => ({ ...previous, [trimmed]: info }));
  };

  const load = async () => {
    if (!window.api) {
      setNotice({ type: 'error', message: 'Electron API 尚未載入，請使用安裝版 App。' });
      setLoading(false);
      return;
    }

    const result = await window.api.getSettings();
    const normalized = (result.settings.modes || []).map(normMode);
    setModes(normalized);
    setSelected(0);
    setLoading(false);

    const paths = new Set();
    normalized.forEach((item) => {
      item.apps.forEach((app) => {
        if (app.path) paths.add(app.path);
        if (app.workspaceFolder) paths.add(app.workspaceFolder);
      });
      item.folders.forEach((folder) => folder && paths.add(folder));
      item.commands.forEach((command) => command.cwd && paths.add(command.cwd));
    });
    paths.forEach((pathValue) => validate(pathValue));
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(
    () => ({
      apps: mode?.apps?.length || 0,
      folders: mode?.folders?.length || 0,
      urls: mode?.urls?.length || 0,
      commands: mode?.commands?.length || 0,
    }),
    [mode],
  );

  const updateMode = (patch) => {
    setModes((previous) =>
      previous.map((item, index) => (index === selected ? { ...item, ...patch } : item)),
    );
  };

  const addMode = () => {
    setModes((previous) => {
      const nextMode = { ...emptyMode(), name: uniqueName('New Work Mode', previous) };
      setSelected(previous.length);
      return [...previous, nextMode];
    });
  };

  const addPresetMode = (preset) => {
    setModes((previous) => {
      const clone = JSON.parse(JSON.stringify(preset));
      const nextMode = { ...emptyMode(), ...clone, name: uniqueName(preset.name, previous) };
      setSelected(previous.length);
      return [...previous, nextMode];
    });
  };

  const duplicateMode = () => {
    if (!mode) return;
    setModes((previous) => {
      const clone = JSON.parse(JSON.stringify(mode));
      clone.name = uniqueName(`${mode.name || 'Work Mode'} Copy`, previous);
      setSelected(previous.length);
      return [...previous, clone];
    });
  };

  const deleteMode = () => {
    setModes((previous) => {
      const next = previous.filter((_, index) => index !== selected);
      setSelected(Math.max(0, Math.min(selected, next.length - 1)));
      return next;
    });
  };

  const move = (key, index, direction) => {
    if (!mode) return;
    const list = mode[key];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    updateMode({ [key]: next });
  };

  const addApp = () =>
    updateMode({ apps: [...mode.apps, { path: '', name: '', icon: '', workspaceFolder: '' }] });
  const setApp = (index, patch) =>
    updateMode({
      apps: mode.apps.map((app, itemIndex) => (itemIndex === index ? { ...app, ...patch } : app)),
    });
  const removeApp = (index) =>
    updateMode({ apps: mode.apps.filter((_, itemIndex) => itemIndex !== index) });

  const pickApp = async (index) => {
    const result = await window.api.pickPath({
      type: 'file',
      title: '選擇 App',
      filters: [
        { name: '可執行檔', extensions: ['exe', 'cmd', 'bat', 'lnk'] },
        { name: '所有檔案', extensions: ['*'] },
      ],
    });
    if (result.ok) {
      setApp(index, { path: result.path });
      validate(result.path);
    }
  };

  const pickAppWorkspace = async (index) => {
    const result = await window.api.pickPath({
      type: 'folder',
      title: '選擇 VS Code 要開啟的工作資料夾',
    });
    if (result.ok) {
      setApp(index, { workspaceFolder: result.path });
      validate(result.path);
    }
  };

  const addString = (key) => updateMode({ [key]: [...mode[key], ''] });
  const setString = (key, index, value) =>
    updateMode({ [key]: mode[key].map((item, itemIndex) => (itemIndex === index ? value : item)) });
  const removeString = (key, index) =>
    updateMode({ [key]: mode[key].filter((_, itemIndex) => itemIndex !== index) });

  const pickFolderInto = async (index) => {
    const result = await window.api.pickPath({ type: 'folder', title: '選擇資料夾' });
    if (result.ok) {
      setString('folders', index, result.path);
      validate(result.path);
    }
  };

  const addCommand = () => updateMode({ commands: [...mode.commands, { cwd: '', command: '' }] });
  const setCommand = (index, patch) =>
    updateMode({
      commands: mode.commands.map((command, itemIndex) =>
        itemIndex === index ? { ...command, ...patch } : command,
      ),
    });
  const removeCommand = (index) =>
    updateMode({ commands: mode.commands.filter((_, itemIndex) => itemIndex !== index) });

  const pickCommandCwd = async (index) => {
    const result = await window.api.pickPath({ type: 'folder', title: '選擇命令執行目錄' });
    if (result.ok) {
      setCommand(index, { cwd: result.path });
      validate(result.path);
    }
  };

  const save = async () => {
    const result = await window.api.getSettings();
    const cleaned = modes
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        apps: item.apps.filter((app) => (app.path || '').trim()).map(denormApp),
        folders: item.folders.map((folder) => folder.trim()).filter(Boolean),
        urls: item.urls.map((url) => url.trim()).filter(Boolean),
        commands: item.commands
          .map((command) => ({
            cwd: (command.cwd || '').trim(),
            command: (command.command || '').trim(),
          }))
          .filter((command) => command.command),
      }));

    const response = await window.api.saveSettings({ ...result.settings, modes: cleaned });
    if (response.ok) {
      setNotice({ type: 'ok', message: '工作模式已儲存' });
      if (onSaved) onSaved();
      await load();
    } else {
      setNotice({ type: 'error', message: response.error || '儲存失敗' });
    }
  };

  const PathStatus = ({ pathValue, want }) => {
    const trimmed = (pathValue || '').trim();
    if (!trimmed) return null;
    const check = pathChecks[trimmed];
    if (!check) return <StatusBadge tone="muted">未檢查</StatusBadge>;
    const typeOk = want === 'file' ? check.isFile : check.isDir;
    return check.exists && typeOk ? (
      <StatusBadge tone="ok">有效</StatusBadge>
    ) : (
      <StatusBadge tone="danger">無效</StatusBadge>
    );
  };

  const RowButtons = ({ listKey, index, length, onRemove }) => (
    <div className="inline-controls compact-controls">
      <Button
        size="sm"
        variant="ghost"
        disabled={index === 0}
        onClick={() => move(listKey, index, -1)}
        title="上移"
      >
        UP
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={index === length - 1}
        onClick={() => move(listKey, index, 1)}
        title="下移"
      >
        DN
      </Button>
      <Button size="sm" variant="ghost" onClick={onRemove} title="刪除">
        DEL
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="loading-block">
        <span className="spinner" />
        正在載入工作模式...
      </div>
    );
  }

  return (
    <div className="mode-editor">
      <div className="row-between">
        <div>
          <div className="section-title">模式編輯器</div>
          <p className="muted">調整會先留在畫面中，按下儲存後才會寫入設定檔。</p>
        </div>
        <div className="head-actions">
          <Button icon="AD" onClick={addMode}>
            新增模式
          </Button>
          <Button icon="SV" variant="primary" onClick={save}>
            儲存設定
          </Button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          margin: '12px 0',
        }}
      >
        <span className="muted">EE 範本：</span>
        {MODE_PRESETS.map((preset) => (
          <Button key={preset.name} size="sm" onClick={() => addPresetMode(preset)}>
            {preset.name}
          </Button>
        ))}
      </div>

      {modes.length === 0 ? (
        <div className="empty-editor">
          <p className="muted">還沒有任何模式。先新增一個模式開始。</p>
          <Button variant="primary" onClick={addMode}>
            新增模式
          </Button>
        </div>
      ) : (
        <>
          <div className="mode-tabs">
            {modes.map((item, index) => (
              <button
                key={`${item.name}-${index}`}
                className={`ui-btn ${index === selected ? 'primary' : 'ghost'}`}
                onClick={() => setSelected(index)}
                type="button"
              >
                {item.name || '(未命名)'}
              </button>
            ))}
          </div>

          {mode ? (
            <div>
              <div className="mode-editor-summary">
                <span>{summary.apps} Apps</span>
                <span>{summary.folders} Folders</span>
                <span>{summary.urls} URLs</span>
                <span>{summary.commands} Commands</span>
              </div>

              <div className="setting-row">
                <div>
                  <div className="label">模式名稱</div>
                  <div className="desc">名稱會顯示在工作模式頁、命令面板與執行結果中。</div>
                </div>
                <div className="inline-controls">
                  <input
                    style={{ ...inputStyle, minWidth: 260 }}
                    value={mode.name}
                    onChange={(event) => updateMode({ name: event.target.value })}
                  />
                  <Button size="sm" onClick={duplicateMode}>
                    複製
                  </Button>
                  <Button size="sm" variant="danger" onClick={deleteMode}>
                    刪除
                  </Button>
                </div>
              </div>

              <ListSection
                title="App"
                description="可加入 VS Code、瀏覽器或其他桌面程式。"
                action={
                  <Button size="sm" onClick={addApp}>
                    新增 App
                  </Button>
                }
              >
                {mode.apps.length === 0 ? <p className="muted">尚未加入 App。</p> : null}
                {mode.apps.map((app, index) => (
                  <div className="editor-row mode-app-row" key={`app-${index}`}>
                    <input
                      style={{ ...inputStyle, width: 58, textAlign: 'center' }}
                      placeholder="圖示"
                      value={app.icon}
                      onChange={(event) => setApp(index, { icon: event.target.value })}
                    />
                    <input
                      style={{ ...inputStyle, width: 140 }}
                      placeholder="名稱"
                      value={app.name}
                      onChange={(event) => setApp(index, { name: event.target.value })}
                    />
                    <input
                      style={pathInputStyle}
                      placeholder="C:\\...\\Code.exe"
                      value={app.path}
                      onChange={(event) => setApp(index, { path: event.target.value })}
                      onBlur={(event) => validate(event.target.value)}
                    />
                    <PathStatus pathValue={app.path} want="file" />
                    <Button size="sm" onClick={() => pickApp(index)}>
                      選擇
                    </Button>
                    <input
                      style={pathInputStyle}
                      placeholder="VS Code 工作資料夾（選填）"
                      value={app.workspaceFolder}
                      onChange={(event) => setApp(index, { workspaceFolder: event.target.value })}
                      onBlur={(event) => validate(event.target.value)}
                    />
                    <PathStatus pathValue={app.workspaceFolder} want="dir" />
                    <Button size="sm" onClick={() => pickAppWorkspace(index)}>
                      工作夾
                    </Button>
                    <RowButtons
                      listKey="apps"
                      index={index}
                      length={mode.apps.length}
                      onRemove={() => removeApp(index)}
                    />
                  </div>
                ))}
              </ListSection>

              <ListSection
                title="資料夾"
                description="會用檔案總管開啟。"
                action={
                  <Button size="sm" onClick={() => addString('folders')}>
                    新增資料夾
                  </Button>
                }
              >
                {mode.folders.length === 0 ? <p className="muted">尚未加入資料夾。</p> : null}
                {mode.folders.map((folder, index) => (
                  <div className="editor-row" key={`folder-${index}`}>
                    <input
                      style={pathInputStyle}
                      placeholder="C:\\Users\\jerem\\Desktop\\..."
                      value={folder}
                      onChange={(event) => setString('folders', index, event.target.value)}
                      onBlur={(event) => validate(event.target.value)}
                    />
                    <PathStatus pathValue={folder} want="dir" />
                    <Button size="sm" onClick={() => pickFolderInto(index)}>
                      選擇
                    </Button>
                    <RowButtons
                      listKey="folders"
                      index={index}
                      length={mode.folders.length}
                      onRemove={() => removeString('folders', index)}
                    />
                  </div>
                ))}
              </ListSection>

              <ListSection
                title="網址"
                description="適合加入 GitHub、文件或本機開發網址。"
                action={
                  <Button size="sm" onClick={() => addString('urls')}>
                    新增網址
                  </Button>
                }
              >
                {mode.urls.length === 0 ? <p className="muted">尚未加入網址。</p> : null}
                {mode.urls.map((url, index) => (
                  <div className="editor-row" key={`url-${index}`}>
                    <input
                      style={pathInputStyle}
                      placeholder="https://github.com/..."
                      value={url}
                      onChange={(event) => setString('urls', index, event.target.value)}
                    />
                    <RowButtons
                      listKey="urls"
                      index={index}
                      length={mode.urls.length}
                      onRemove={() => removeString('urls', index)}
                    />
                  </div>
                ))}
              </ListSection>

              <ListSection
                title="命令"
                description="可啟動 npm run dev、Python script 或其他 shell 命令。"
                action={
                  <Button size="sm" onClick={addCommand}>
                    新增命令
                  </Button>
                }
              >
                {mode.commands.length === 0 ? <p className="muted">尚未加入命令。</p> : null}
                {mode.commands.map((command, index) => (
                  <div className="editor-row" key={`command-${index}`}>
                    <input
                      style={{ ...pathInputStyle, maxWidth: 280 }}
                      placeholder="執行目錄"
                      value={command.cwd}
                      onChange={(event) => setCommand(index, { cwd: event.target.value })}
                      onBlur={(event) => validate(event.target.value)}
                    />
                    <PathStatus pathValue={command.cwd} want="dir" />
                    <Button size="sm" onClick={() => pickCommandCwd(index)}>
                      選擇
                    </Button>
                    <input
                      style={pathInputStyle}
                      placeholder="npm run dev"
                      value={command.command}
                      onChange={(event) => setCommand(index, { command: event.target.value })}
                    />
                    <RowButtons
                      listKey="commands"
                      index={index}
                      length={mode.commands.length}
                      onRemove={() => removeCommand(index)}
                    />
                  </div>
                ))}
              </ListSection>
            </div>
          ) : null}
        </>
      )}

      {notice ? <div className={`toast ${notice.type}`}>{notice.message}</div> : null}
    </div>
  );
}
