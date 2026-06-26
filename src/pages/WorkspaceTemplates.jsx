import React, { useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PathPickerRow from '../components/PathPickerRow.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

const LANGUAGE_OPTIONS = [
  { id: 'javascript', name: 'JavaScript' },
  { id: 'typescript', name: 'TypeScript' },
  { id: 'python', name: 'Python' },
  { id: 'java', name: 'Java' },
  { id: 'csharp', name: 'C#' },
  { id: 'cpp', name: 'C / C++' },
  { id: 'go', name: 'Go' },
  { id: 'rust', name: 'Rust' },
  { id: 'php', name: 'PHP' },
  { id: 'ruby', name: 'Ruby' },
  { id: 'dart', name: 'Dart' },
  { id: 'kotlin', name: 'Kotlin' },
  { id: 'swift', name: 'Swift' },
  { id: 'verilog', name: 'Verilog' },
  { id: 'vhdl', name: 'VHDL' },
  { id: 'matlab', name: 'MATLAB' },
  { id: 'arduino', name: 'Arduino' },
  { id: 'sql', name: 'SQL' },
  { id: 'powershell', name: 'PowerShell' },
  { id: 'htmlcss', name: 'HTML / CSS' },
];

const TEMPLATES = [
  {
    id: 'custom-combo',
    name: 'Custom Combo',
    desc: '自由勾選多種語言，建立混合工作區。',
    modules: [],
  },
  {
    id: 'react-vite',
    name: 'React / Vite',
    desc: 'React frontend app with Vite.',
    modules: ['JavaScript', 'React'],
  },
  {
    id: 'electron',
    name: 'Electron App',
    desc: 'Windows desktop utility or local app.',
    modules: ['JavaScript', 'Electron'],
  },
  {
    id: 'python',
    name: 'Python',
    desc: 'Python script, automation, or data workspace.',
    modules: ['Python'],
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    desc: 'Node.js JavaScript workspace.',
    modules: ['JavaScript'],
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    desc: 'TypeScript starter workspace.',
    modules: ['TypeScript'],
  },
  { id: 'java', name: 'Java', desc: 'Java starter workspace.', modules: ['Java'] },
  { id: 'csharp', name: 'C#', desc: 'C# starter workspace.', modules: ['C#'] },
  { id: 'cpp', name: 'C / C++', desc: 'C++ starter workspace with CMake.', modules: ['C++'] },
  { id: 'go', name: 'Go', desc: 'Go module workspace.', modules: ['Go'] },
  { id: 'rust', name: 'Rust', desc: 'Rust Cargo workspace.', modules: ['Rust'] },
  {
    id: 'web',
    name: 'HTML / CSS / JS',
    desc: 'Static web workspace.',
    modules: ['HTML', 'CSS', 'JavaScript'],
  },
  {
    id: 'data-stack',
    name: 'Python + SQL',
    desc: 'Data scripting workspace.',
    modules: ['Python', 'SQL'],
  },
  {
    id: 'fullstack-js',
    name: 'TypeScript + Web',
    desc: 'TypeScript and web starter workspace.',
    modules: ['TypeScript', 'HTML/CSS'],
  },
  {
    id: 'hardware',
    name: 'C++ + Verilog',
    desc: 'Hardware / firmware starter workspace.',
    modules: ['C++', 'Verilog'],
  },
  {
    id: 'arduino',
    name: 'Arduino / 微控制器',
    desc: 'Arduino / 微控制器 sketch 工作區。',
    modules: ['Arduino'],
  },
  {
    id: 'fpga-verilog',
    name: 'FPGA / Verilog',
    desc: 'Verilog RTL + testbench（Quartus / Vivado）。',
    modules: ['Verilog'],
  },
  {
    id: 'fpga-vhdl',
    name: 'FPGA / VHDL',
    desc: 'VHDL RTL 工作區（Quartus / Vivado）。',
    modules: ['VHDL'],
  },
  {
    id: 'matlab',
    name: 'MATLAB / 訊號處理',
    desc: 'MATLAB / Octave 腳本工作區。',
    modules: ['MATLAB'],
  },
  {
    id: 'embedded-c',
    name: 'STM32 / 嵌入式 C',
    desc: 'Bare-metal 嵌入式 C 工作區。',
    modules: ['C'],
  },
  {
    id: 'kicad',
    name: 'KiCad PCB 專案',
    desc: 'KiCad PCB 專案骨架（資料夾 + 說明）。',
    modules: [],
  },
  { id: 'documents', name: 'Documents', desc: 'Reports, notes, assets, and exports.', modules: [] },
  {
    id: 'custom-folder',
    name: 'Custom Folder',
    desc: 'A clean folder for manual expansion.',
    modules: [],
  },
];

function withTimeout(promise, ms = 12000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('建立逾時，請確認資料夾權限或同步工具是否鎖住。')),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function safeSuggestion(templateId) {
  if (templateId === 'custom-combo') return 'mixed-language-workspace';
  if (templateId === 'custom-folder') return 'new-folder';
  if (templateId === 'react-vite') return 'react-vite-app';
  if (templateId === 'electron') return 'electron-app';
  if (templateId === 'documents') return 'documents-workspace';
  if (templateId === 'arduino') return 'arduino-project';
  if (templateId === 'fpga-verilog') return 'fpga-verilog-project';
  if (templateId === 'fpga-vhdl') return 'fpga-vhdl-project';
  if (templateId === 'matlab') return 'matlab-workspace';
  if (templateId === 'embedded-c') return 'stm32-firmware';
  if (templateId === 'kicad') return 'kicad-pcb';
  return templateId;
}

function toggleId(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export default function WorkspaceTemplates({ onNavigate }) {
  const { toast } = useToast();
  const [hub, setHub] = useState(null);
  const [templateId, setTemplateId] = useState('custom-combo');
  const [languageIds, setLanguageIds] = useState(['python', 'javascript']);
  const [name, setName] = useState('mixed-language-workspace');
  const [baseDir, setBaseDir] = useState('');
  const [addToMode, setAddToMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!window.api) return;
    window.api
      .getProjectHubSettings()
      .then((result) => {
        if (result.ok) {
          setHub(result.projectHub);
          setBaseDir((result.projectHub.scanRoots || [])[0] || '');
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === templateId) || TEMPLATES[0],
    [templateId],
  );

  const selectedLanguageNames = LANGUAGE_OPTIONS.filter((language) =>
    languageIds.includes(language.id),
  ).map((language) => language.name);

  const pickBase = async () => {
    const result = await window.api.pickPath({ type: 'folder', title: '選擇工作區建立位置' });
    if (result.ok) setBaseDir(result.path);
  };

  const create = async () => {
    if (!window.api?.createProjectFromTemplate) {
      setError('目前版本缺少建立工作區 API，請重新安裝最新版。');
      return;
    }
    if (templateId === 'custom-combo' && languageIds.length === 0) {
      setError('請至少選擇一種語言。');
      return;
    }
    setBusy(true);
    setCreated(null);
    setError('');
    try {
      const result = await withTimeout(
        window.api.createProjectFromTemplate({
          templateId,
          languageIds: templateId === 'custom-combo' ? languageIds : undefined,
          name,
          baseDir,
          addToMode,
          githubUrl: 'https://github.com/',
        }),
      );
      if (!result.ok) {
        setError(result.error || '建立工作區失敗');
        toast(result.error || '建立工作區失敗', 'error');
        return;
      }
      setCreated(result);
      toast(`工作區已建立：${result.project.name}`, 'ok');
    } catch (err) {
      setError(err.message || '建立工作區失敗');
      toast(err.message || '建立工作區失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-template-page">
      <PageHeader
        eyebrow="WORKSPACE"
        title="Workspace Templates"
        description="選擇單一語言模板，或用 Custom Combo 自由組合多種語言。工作模式預設開 VS Code、資料夾與 GitHub。"
        actions={
          <Button variant="ghost" onClick={() => onNavigate && onNavigate('projects')}>
            前往 Project Hub
          </Button>
        }
      />

      <div className="template-grid wide-template-grid">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            className={`template-card ${templateId === template.id ? 'active' : ''}`}
            onClick={() => {
              setTemplateId(template.id);
              setName(safeSuggestion(template.id));
              setCreated(null);
              setError('');
            }}
          >
            <div className="template-card-head">
              <strong>{template.name}</strong>
              {templateId === template.id ? <StatusBadge tone="ok">已選擇</StatusBadge> : null}
            </div>
            <p>{template.desc}</p>
            <div className="chip-row">
              {(template.id === 'custom-combo' ? selectedLanguageNames : template.modules)
                .slice(0, 4)
                .map((item) => (
                  <span className="mini-chip" key={item}>
                    {item}
                  </span>
                ))}
              {template.id === 'custom-combo' && selectedLanguageNames.length === 0 ? (
                <span className="muted">請選擇語言</span>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      {templateId === 'custom-combo' ? (
        <SectionPanel
          title="自訂語言組合"
          description="勾選要放進同一個工作區的語言。每種語言會建立自己的子資料夾，避免檔案互相覆蓋。"
        >
          <div className="language-grid">
            {LANGUAGE_OPTIONS.map((language) => (
              <label
                className={`language-chip ${languageIds.includes(language.id) ? 'active' : ''}`}
                key={language.id}
              >
                <input
                  type="checkbox"
                  checked={languageIds.includes(language.id)}
                  onChange={() => setLanguageIds((current) => toggleId(current, language.id))}
                />
                <span>{language.name}</span>
              </label>
            ))}
          </div>
        </SectionPanel>
      ) : null}

      <SectionPanel
        title="建立設定"
        description="建立流程只會寫入模板檔案；同名資料夾已存在時會停止，不會覆蓋。"
      >
        <PathPickerRow
          label="建立位置"
          description="建議選 Project Hub 的掃描根目錄。"
          value={baseDir}
          onChange={setBaseDir}
          onPick={pickBase}
        />
        <div className="form-grid">
          <label>
            <span>工作區名稱</span>
            <input
              className="path-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={addToMode}
              onChange={(event) => setAddToMode(event.target.checked)}
            />
            <span>建立後加入工作模式：VS Code + 資料夾 + GitHub</span>
          </label>
        </div>
        <div className="head-actions" style={{ marginTop: 16 }}>
          <Button variant="primary" onClick={create} busy={busy} disabled={!baseDir || !name}>
            建立工作區
          </Button>
        </div>
      </SectionPanel>

      {error ? (
        <InlineAlert tone="danger" title="建立失敗">
          {error}
        </InlineAlert>
      ) : null}

      {created ? (
        <InlineAlert tone="ok" title="建立完成">
          {created.project.name} 已建立於 {created.project.path}。語言：
          {(created.languages || []).join(', ') || selectedTemplate.name}。
        </InlineAlert>
      ) : null}

      {hub ? (
        <SectionPanel title="目前掃描根目錄">
          <div className="path-list">
            {(hub.scanRoots || []).map((root) => (
              <div className="path-list-row" key={root}>
                <span>{root}</span>
              </div>
            ))}
          </div>
        </SectionPanel>
      ) : null}
    </div>
  );
}
