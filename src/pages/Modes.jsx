import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ModeEditor from '../components/ModeEditor.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const STEP_LABEL = {
  app: 'App',
  folder: '資料夾',
  url: '網址',
  command: '命令',
};

function appName(app) {
  if (typeof app === 'string') return app.split(/[\\/]/).pop() || app;
  return app?.name || app?.path?.split(/[\\/]/).pop() || 'App';
}

function includesText(value, query) {
  return String(value || '')
    .toLowerCase()
    .includes(query);
}

function modeHaystack(mode) {
  return [
    mode.name,
    ...(mode.apps || []).map((item) =>
      typeof item === 'string'
        ? item
        : `${item.name || ''} ${item.path || ''} ${item.workspaceFolder || ''}`,
    ),
    ...(mode.folders || []),
    ...(mode.urls || []),
    ...(mode.commands || []).map((item) => `${item.cwd || ''} ${item.command || ''}`),
  ].join(' ');
}

function modeSize(mode) {
  return (
    (mode.apps?.length || 0) +
    (mode.folders?.length || 0) +
    (mode.urls?.length || 0) +
    (mode.commands?.length || 0)
  );
}

export default function Modes({ externalResult }) {
  const [modes, setModes] = useState([]);
  const [busyMode, setBusyMode] = useState(null);
  const [result, setResult] = useState(externalResult || null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (externalResult) setResult(externalResult);
  }, [externalResult]);

  const loadModes = useCallback(async () => {
    if (!window.api) {
      setError('Electron API 尚未載入，請使用安裝版 App 開啟。');
      return;
    }
    const response = await window.api.listModes();
    setModes(response.modes || []);
    setError(response.ok === false ? response.error || '讀取工作模式失敗' : '');
  }, []);

  useEffect(() => {
    loadModes();
  }, [loadModes]);

  const filteredModes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return modes
      .filter((mode) => {
        if (filter === 'withApps' && !(mode.apps || []).length) return false;
        if (filter === 'withFolders' && !(mode.folders || []).length) return false;
        if (filter === 'withUrls' && !(mode.urls || []).length) return false;
        if (filter === 'withCommands' && !(mode.commands || []).length) return false;
        return !normalizedQuery || includesText(modeHaystack(mode), normalizedQuery);
      })
      .sort((a, b) => modeSize(b) - modeSize(a) || a.name.localeCompare(b.name, 'zh-Hant'));
  }, [modes, query, filter]);

  const run = async (name) => {
    setBusyMode(name);
    setResult(null);
    const response = await window.api.runMode(name);
    setResult(response);
    setBusyMode(null);
  };

  const resultRows = result?.steps || [];

  return (
    <div>
      <PageHeader
        eyebrow="MODES"
        title="工作模式"
        description="一次開啟 VS Code、資料夾、GitHub、網頁與啟動命令，讓不同工作情境快速準備好桌面。"
        actions={
          <>
            <StatusBadge tone="muted">{modes.length} 個模式</StatusBadge>
            <Button
              variant={editing ? 'primary' : 'ghost'}
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? '完成編輯' : '編輯模式'}
            </Button>
          </>
        }
      />

      {error ? <div className="error-banner">{error}</div> : null}

      {editing ? (
        <Card style={{ marginBottom: 16 }}>
          <ModeEditor onSaved={loadModes} />
        </Card>
      ) : null}

      <Card style={{ marginBottom: 16 }}>
        <div className="mode-toolbar">
          <input
            className="project-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋模式名稱、資料夾、GitHub URL、命令..."
          />
          <select
            className="compact-select"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">全部模式</option>
            <option value="withApps">含 App</option>
            <option value="withFolders">含資料夾</option>
            <option value="withUrls">含網址</option>
            <option value="withCommands">含命令</option>
          </select>
        </div>
        <div className="filter-row">
          {[
            ['all', '全部'],
            ['withApps', 'App'],
            ['withFolders', '資料夾'],
            ['withUrls', '網址'],
            ['withCommands', '命令'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filter-chip ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {modes.length === 0 ? (
        <Card>
          <EmptyState
            title="尚未建立工作模式"
            description="建立一個 Coding、Study 或 Meeting 模式，之後就能一鍵開啟需要的工具。"
            action={
              <Button variant="primary" onClick={() => setEditing(true)}>
                建立第一個模式
              </Button>
            }
          />
        </Card>
      ) : filteredModes.length === 0 ? (
        <Card>
          <EmptyState
            title="找不到符合的工作模式"
            description="換個關鍵字或清除篩選條件後再試一次。"
          />
        </Card>
      ) : (
        <div className="mode-grid">
          {filteredModes.map((mode) => (
            <Card key={mode.name} className="mode-card">
              <div className="mode-card-head">
                <div>
                  <div className="project-title">{mode.name}</div>
                  <div className="project-meta">
                    <span>{mode.apps.length} apps</span>
                    <span>{mode.folders.length} folders</span>
                    <span>{mode.urls.length} urls</span>
                    <span>{mode.commands.length} commands</span>
                  </div>
                </div>
                <Button
                  variant="primary"
                  busy={busyMode === mode.name}
                  onClick={() => run(mode.name)}
                >
                  啟動
                </Button>
              </div>

              <div className="mode-preview">
                {(mode.apps || []).slice(0, 3).map((app, index) => (
                  <span key={`app-${index}`}>App: {appName(app)}</span>
                ))}
                {(mode.folders || []).slice(0, 2).map((folder, index) => (
                  <span key={`folder-${index}`}>Folder: {folder}</span>
                ))}
                {(mode.urls || []).slice(0, 2).map((url, index) => (
                  <span key={`url-${index}`}>URL: {url}</span>
                ))}
                {(mode.commands || []).slice(0, 2).map((command, index) => (
                  <span key={`command-${index}`}>Command: {command.command}</span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {result ? (
        <Card title={`執行結果：${result.mode || '--'}`} icon="RS" style={{ marginTop: 16 }}>
          <div className="result-strip">
            <StatusBadge tone={result.ok ? 'ok' : 'warn'}>
              {result.ok ? '完成' : '部分失敗'}
            </StatusBadge>
            {resultRows.length ? <span className="muted">{resultRows.length} 個步驟</span> : null}
          </div>
          {result.error ? <div className="error-banner">{result.error}</div> : null}
          {resultRows.length > 0 ? (
            <DataTable
              rows={resultRows}
              columns={[
                {
                  key: 'type',
                  label: '類型',
                  render: (row) => <span className="tag">{STEP_LABEL[row.type] || row.type}</span>,
                },
                {
                  key: 'target',
                  label: '目標',
                  render: (row) => <span className="path">{row.target}</span>,
                },
                {
                  key: 'status',
                  label: '狀態',
                  render: (row) => (
                    <span
                      className={
                        row.status === 'ok'
                          ? 'status-ok'
                          : row.status === 'skipped'
                            ? 'muted'
                            : 'status-error'
                      }
                    >
                      {row.status === 'ok' ? '成功' : row.status === 'skipped' ? '略過' : '失敗'}
                    </span>
                  ),
                },
                {
                  key: 'message',
                  label: '訊息',
                  render: (row) => <span className="muted">{row.message}</span>,
                },
              ]}
            />
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
