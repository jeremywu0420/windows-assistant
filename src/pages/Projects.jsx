import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

const ACTIONS = [
  { key: 'openFolder', label: '開資料夾' },
  { key: 'openVSCode', label: 'VS Code' },
  { key: 'openTerminal', label: 'Terminal' },
  { key: 'runDev', label: 'Dev' },
  { key: 'gitStatus', label: 'Git' },
];

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pinned', label: '已加入工作區' },
  { key: 'git', label: 'Git Repo' },
  { key: 'dirty', label: '有變更' },
  { key: 'folder', label: '一般資料夾' },
  { key: 'missing', label: '路徑遺失' },
];

const SORTS = [
  { key: 'score', label: '智慧排序' },
  { key: 'name', label: '名稱 A-Z' },
  { key: 'modified', label: '最近修改' },
  { key: 'category', label: '類型' },
];

function normalizePath(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function projectTone(project) {
  if (!project.exists) return 'danger';
  if (project.modifiedCount > 0) return 'warn';
  if (project.isGitRepo) return 'ok';
  return 'muted';
}

function projectLabel(project) {
  if (!project.exists) return '路徑遺失';
  if (project.modifiedCount > 0) return `${project.modifiedCount} 個變更`;
  if (project.isGitRepo) return 'Git Repo';
  return '資料夾';
}

function matchesStatus(project, filter, workspacePaths) {
  if (filter === 'pinned') return workspacePaths.has(normalizePath(project.path));
  if (filter === 'git') return project.isGitRepo;
  if (filter === 'dirty') return project.modifiedCount > 0;
  if (filter === 'folder') return project.exists && !project.isGitRepo;
  if (filter === 'missing') return !project.exists;
  return true;
}

function sortProjects(items, sortKey, workspacePaths) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const aPinned = workspacePaths.has(normalizePath(a.path));
    const bPinned = workspacePaths.has(normalizePath(b.path));
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    if (sortKey === 'name') return String(a.name).localeCompare(String(b.name), 'zh-Hant');
    if (sortKey === 'category') {
      const byCategory = String(a.category || '').localeCompare(
        String(b.category || ''),
        'zh-Hant',
      );
      return byCategory || String(a.name).localeCompare(String(b.name), 'zh-Hant');
    }
    if (sortKey === 'modified')
      return Date.parse(b.lastModified || 0) - Date.parse(a.lastModified || 0);
    return (
      (b.weight || 0) - (a.weight || 0) || String(a.name).localeCompare(String(b.name), 'zh-Hant')
    );
  });
  return sorted;
}

function formatDate(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString();
}

function toWorkspaceProject(project) {
  return {
    name: project.name,
    path: project.path,
    isFile: !!project.isFile,
    category: project.category || '',
  };
}

function uniqueModeName(base, modes) {
  const names = new Set((modes || []).map((mode) => mode.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function suggestedModeName(projects) {
  if (!projects.length) return '';
  if (projects.length === 1) return `${projects[0].name} 工作模式`;
  return `${projects[0].name} 等 ${projects.length} 個專案 工作模式`;
}

export default function Projects({ onNavigate }) {
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [hub, setHub] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState('score');
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [modeNameDraft, setModeNameDraft] = useState('');

  const load = useCallback(async () => {
    if (!window.api) return;
    setLoading(true);
    setError('');
    const [projectResult, hubResult, statusResult] = await Promise.all([
      window.api.listProjects(),
      window.api.getProjectHubSettings(),
      window.api.getProjectScanStatus(),
    ]);
    if (projectResult.ok) setProjects(projectResult.projects || []);
    else setError(projectResult.error || '讀取 Project Hub 失敗');
    if (hubResult.ok) setHub(hubResult.projectHub);
    if (statusResult.ok) setScanStatus(statusResult.status);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      window.api
        ?.getProjectScanStatus?.()
        .then((result) => result.ok && setScanStatus(result.status));
    }, 2500);
    return () => clearInterval(id);
  }, [load]);

  const workspaceProjects = hub?.pinnedProjects || [];
  const workspacePaths = useMemo(
    () => new Set(workspaceProjects.map((item) => normalizePath(item.path))),
    [workspaceProjects],
  );
  const selectedPathSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const stats = useMemo(
    () => ({
      total: projects.length,
      workspace: workspaceProjects.length,
      git: projects.filter((project) => project.isGitRepo).length,
      dirty: projects.filter((project) => project.modifiedCount > 0).length,
      missing: projects.filter((project) => !project.exists).length,
    }),
    [projects, workspaceProjects.length],
  );

  const categories = useMemo(() => {
    const counts = new Map();
    projects.forEach((project) => {
      const category = project.category || 'Unknown';
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const text = query.trim().toLowerCase();
    const result = projects.filter((project) => {
      const haystack = [
        project.name,
        project.path,
        project.category,
        ...(project.tags || []),
        ...(project.filterCategories || []),
        ...(project.sourceSample || []),
      ]
        .join(' ')
        .toLowerCase();
      return (
        (!text || haystack.includes(text)) &&
        matchesStatus(project, statusFilter, workspacePaths) &&
        (categoryFilter === 'all' || project.category === categoryFilter)
      );
    });
    return sortProjects(result, sortKey, workspacePaths);
  }, [projects, query, statusFilter, categoryFilter, sortKey, workspacePaths]);

  const selectedProjects = useMemo(() => {
    return projects.filter((project) => selectedPathSet.has(normalizePath(project.path)));
  }, [projects, selectedPathSet]);

  const modeNameValue = modeNameDraft || suggestedModeName(selectedProjects);
  const selectedWorkspaceCount = selectedProjects.filter((project) =>
    workspacePaths.has(normalizePath(project.path)),
  ).length;
  const selectedNewCount = selectedProjects.length - selectedWorkspaceCount;

  const saveHub = async (patch) => {
    const next = { ...(hub || {}), ...patch };
    setHub(next);
    const result = await window.api.saveProjectHubSettings(next);
    if (!result.ok) toast(result.error || '儲存 Project Hub 設定失敗', 'error');
    return result;
  };

  const toggleSelected = (project) => {
    const key = normalizePath(project.path);
    setSelectedPaths((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const selectVisible = () => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      filteredProjects.forEach((project) => next.add(normalizePath(project.path)));
      return [...next];
    });
  };

  const clearSelection = () => setSelectedPaths([]);

  const addProjectsToWorkspace = async (items) => {
    const existing = new Set(workspaceProjects.map((item) => normalizePath(item.path)));
    const additions = items
      .filter((project) => !existing.has(normalizePath(project.path)))
      .map(toWorkspaceProject);
    if (!additions.length) {
      toast('選取的專案都已經在工作區了', 'ok');
      return;
    }
    const result = await saveHub({ pinnedProjects: [...additions, ...workspaceProjects] });
    if (result.ok) toast(`已加入 ${additions.length} 個專案到工作區`, 'ok');
  };

  const removeProjectsFromWorkspace = async (items) => {
    const removeSet = new Set(items.map((project) => normalizePath(project.path)));
    const next = workspaceProjects.filter((item) => !removeSet.has(normalizePath(item.path)));
    const removed = workspaceProjects.length - next.length;
    if (!removed) {
      toast('選取的專案不在工作區內', 'ok');
      return;
    }
    const result = await saveHub({ pinnedProjects: next });
    if (result.ok) toast(`已從工作區移除 ${removed} 個專案`, 'ok');
  };

  const createModeFromSelected = async () => {
    const existingProjects = selectedProjects.filter((project) => project.exists !== false);
    if (!existingProjects.length) {
      toast('請先選擇至少一個存在的專案', 'error');
      return;
    }

    const settingsResult = await window.api.getSettings();
    if (!settingsResult.ok) {
      toast(settingsResult.error || '讀取設定失敗', 'error');
      return;
    }

    const settings = settingsResult.settings || {};
    const modes = Array.isArray(settings.modes) ? settings.modes : [];
    const general = settings.general || {};
    const modeName = uniqueModeName((modeNameValue || 'Project Hub 工作模式').trim(), modes);
    const vscodePath = general.vscodePath || 'Code.exe';
    const projectPaths = Array.from(
      new Set(existingProjects.map((project) => project.path).filter(Boolean)),
    );

    const mode = {
      name: modeName,
      apps: projectPaths.map((projectPath) => ({
        path: vscodePath,
        name: 'VS Code',
        icon: 'VS',
        workspaceFolder: projectPath,
      })),
      folders: projectPaths,
      urls: [],
      commands: existingProjects
        .filter((project) => project.hasDevScript)
        .map((project) => ({ cwd: project.path, command: 'npm run dev' })),
    };

    const saved = await window.api.saveSettings({ ...settings, modes: [mode, ...modes] });
    if (!saved.ok) {
      toast(saved.error || '建立工作模式失敗', 'error');
      return;
    }

    toast(`已建立工作模式：${modeName}`, 'ok');
    setModeNameDraft('');
    if (onNavigate) onNavigate('modes');
  };

  const toggleWorkspace = async (project) => {
    if (workspacePaths.has(normalizePath(project.path))) {
      await removeProjectsFromWorkspace([project]);
    } else {
      await addProjectsToWorkspace([project]);
    }
  };

  const doAction = async (project, action) => {
    setBusy(`${project.path}:${action}`);
    const result = await window.api.runProjectAction({
      projectName: project.name,
      projectPath: project.path,
      isFile: project.isFile,
      action,
    });
    setBusy('');
    if (action === 'gitStatus' && result.ok) {
      toast(`${result.status.name}: ${result.status.modifiedCount || 0} 個未提交變更`, 'ok');
      load();
      return;
    }
    toast(
      result.ok ? result.message || '操作完成' : result.error || '操作失敗',
      result.ok ? 'ok' : 'error',
    );
  };

  const addRoot = async () => {
    const picked = await window.api.pickPath({
      type: 'folder',
      title: '加入 Project Hub 掃描根目錄',
    });
    if (!picked.ok) return;
    const result = await window.api.addProjectScanRoot(picked.path);
    toast(result.ok ? '已加入掃描根目錄' : result.error || '加入失敗', result.ok ? 'ok' : 'error');
    load();
  };

  const removeRoot = async (root) => {
    const result = await window.api.removeProjectScanRoot(root);
    toast(result.ok ? '已移除掃描根目錄' : result.error || '移除失敗', result.ok ? 'ok' : 'error');
    load();
  };

  return (
    <div className="projects-page">
      <PageHeader
        eyebrow="WORKSPACE"
        title="Project Hub"
        description="掃描常用資料夾裡的專案，選取後可加入每日工作區，也可以直接開 VS Code、Terminal、Dev 或檢查 Git。"
        actions={
          <>
            <StatusBadge tone="muted">{stats.total} 個專案</StatusBadge>
            <StatusBadge tone="ok">{stats.workspace} 個工作區</StatusBadge>
            <StatusBadge tone="ok">{stats.git} 個 Git repo</StatusBadge>
            {stats.dirty ? <StatusBadge tone="warn">{stats.dirty} 個有變更</StatusBadge> : null}
            <Button variant="ghost" onClick={() => onNavigate && onNavigate('workspaceTemplates')}>
              建立新工作區
            </Button>
            <Button variant="primary" onClick={load} busy={loading}>
              重新掃描
            </Button>
          </>
        }
      />

      {error ? (
        <InlineAlert tone="danger" title="讀取失敗">
          {error}
        </InlineAlert>
      ) : null}
      {scanStatus?.active ? (
        <InlineAlert tone="info" title="正在掃描">
          {scanStatus.message || 'Project Hub 正在讀取資料夾'}，根目錄 {scanStatus.scannedRoots}/
          {scanStatus.totalRoots}
        </InlineAlert>
      ) : null}

      <SectionPanel
        title="掃描設定"
        description="調整 Project Hub 會搜尋的根目錄與掃描深度。掃描深度越高，找到的子資料夾越多，但也會更慢。"
        actions={
          <>
            <Button size="sm" onClick={addRoot}>
              加入根目錄
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.api.cancelProjectScan().then(load)}
            >
              取消掃描
            </Button>
          </>
        }
      >
        <div className="settings-grid">
          <div>
            <div className="panel-label">根目錄</div>
            <div className="path-list compact-path-list">
              {(hub?.scanRoots || []).map((root) => (
                <div className="path-list-row" key={root}>
                  <span>{root}</span>
                  <Button size="sm" variant="ghost" onClick={() => removeRoot(root)}>
                    移除
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <label>
            <span className="panel-label">掃描深度</span>
            <input
              className="path-input"
              type="number"
              min="0"
              max="5"
              value={hub?.maxDepth ?? 2}
              onChange={(event) => saveHub({ maxDepth: Number(event.target.value) })}
            />
          </label>
        </div>
      </SectionPanel>

      <SectionPanel
        title="專案瀏覽"
        description="勾選 Project Hub 裡的專案後按加入工作區。已加入的專案會固定在最上方，並出現在每日工作台。"
        actions={
          <StatusBadge tone="muted">
            顯示 {filteredProjects.length} / {projects.length}
          </StatusBadge>
        }
      >
        <div className="project-toolbar">
          <input
            className="project-search"
            value={query}
            placeholder="搜尋名稱、路徑、類型、檔案..."
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="path-input compact-select"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
          >
            {SORTS.map((sort) => (
              <option key={sort.key} value={sort.key}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>

        <div className="project-selection-bar">
          <div>
            <strong>{selectedProjects.length}</strong>
            <span> 個已選取</span>
            {selectedProjects.length ? (
              <em>
                {selectedNewCount} 個可加入，{selectedWorkspaceCount} 個已在工作區
              </em>
            ) : null}
          </div>
          <input
            className="mode-name-input"
            value={modeNameDraft}
            onChange={(event) => setModeNameDraft(event.target.value)}
            placeholder={
              selectedProjects.length
                ? suggestedModeName(selectedProjects)
                : '工作模式名稱（選取專案後可填）'
            }
            disabled={!selectedProjects.length}
          />
          <div className="head-actions">
            <Button size="sm" onClick={selectVisible} disabled={!filteredProjects.length}>
              全選目前清單
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => addProjectsToWorkspace(selectedProjects)}
              disabled={!selectedProjects.length || selectedNewCount === 0}
            >
              加入工作區
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={createModeFromSelected}
              disabled={!selectedProjects.length}
            >
              建立工作模式
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeProjectsFromWorkspace(selectedProjects)}
              disabled={!selectedWorkspaceCount}
            >
              從工作區移除
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={!selectedProjects.length}
            >
              清除選取
            </Button>
          </div>
        </div>

        <div className="filter-row">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-chip ${statusFilter === filter.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="category-strip">
          <button
            type="button"
            className={`category-chip ${categoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            全部類型
          </button>
          {categories.map(([category, count]) => (
            <button
              key={category}
              type="button"
              className={`category-chip ${categoryFilter === category ? 'active' : ''}`}
              onClick={() => setCategoryFilter(category)}
            >
              {category}
              <span>{count}</span>
            </button>
          ))}
        </div>

        {filteredProjects.length === 0 ? (
          <EmptyState
            title="沒有符合條件的專案"
            description="試著放寬搜尋、切換篩選，或新增掃描根目錄。"
          />
        ) : (
          <div className="project-card-list">
            {filteredProjects.map((project) => {
              const inWorkspace = workspacePaths.has(normalizePath(project.path));
              const selected = selectedPathSet.has(normalizePath(project.path));
              return (
                <article
                  className={`project-card ${inWorkspace ? 'pinned' : ''} ${selected ? 'selected' : ''}`}
                  key={project.path}
                >
                  <div className="project-card-main">
                    <label className="project-select" title="選取專案">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(project)}
                      />
                    </label>
                    <button
                      type="button"
                      className={`pin-button ${inWorkspace ? 'active' : ''}`}
                      onClick={() => toggleWorkspace(project)}
                      title={inWorkspace ? '從工作區移除' : '加入工作區'}
                    >
                      {inWorkspace ? '已加入' : '加入'}
                    </button>
                    <div className="project-avatar">
                      {String(project.name || '?')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="project-card-copy">
                      <div className="project-card-head">
                        <h3>{project.name}</h3>
                        {inWorkspace ? <StatusBadge tone="ok">工作區</StatusBadge> : null}
                        <StatusBadge tone={projectTone(project)}>
                          {projectLabel(project)}
                        </StatusBadge>
                      </div>
                      <div className="project-path">{project.path}</div>
                      <div className="project-tags">
                        <span>{project.category || 'Unknown'}</span>
                        {project.hasPackageJson ? <span>package.json</span> : null}
                        {project.hasDevScript ? <span>dev script</span> : null}
                        {project.scanTruncated ? <span>scan truncated</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className="project-card-meta">
                    <div>
                      <strong>{project.detectedFileCount ?? '--'}</strong>
                      <span>偵測檔案</span>
                    </div>
                    <div>
                      <strong>{project.totalFileCount ?? '--'}</strong>
                      <span>總檔案</span>
                    </div>
                    <div>
                      <strong>{formatDate(project.lastModified)}</strong>
                      <span>最後修改</span>
                    </div>
                  </div>

                  <div className="project-card-actions">
                    {ACTIONS.map((action) => (
                      <Button
                        key={action.key}
                        size="sm"
                        disabled={!project.exists}
                        busy={busy === `${project.path}:${action.key}`}
                        onClick={() => doAction(project, action.key)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
