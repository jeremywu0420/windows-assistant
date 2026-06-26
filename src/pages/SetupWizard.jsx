import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PathPickerRow from '../components/PathPickerRow.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

const STEPS = [
  { key: 'downloads', label: 'Downloads' },
  { key: 'screenshots', label: 'Screenshots' },
  { key: 'vscode', label: 'VS Code' },
  { key: 'projects', label: '專案根目錄' },
  { key: 'monitor', label: '監控' },
  { key: 'summary', label: '完成' },
];

function upsertRoot(roots, nextRoot) {
  if (!nextRoot) return roots || [];
  const seen = new Set();
  return [...(roots || []), nextRoot].filter((root) => {
    const key = String(root).toLowerCase();
    if (!root || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function SetupWizard({ onNavigate }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!window.api) return;
    const [settingsResult, statusResult] = await Promise.all([
      window.api.getSettings(),
      window.api.getSetupStatus ? window.api.getSetupStatus() : Promise.resolve(null),
    ]);
    if (settingsResult.ok) setSettings(settingsResult.settings);
    if (statusResult && statusResult.ok) setSetupStatus(statusResult);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const general = settings?.general || {};
  const projectHub = settings?.projectHub || {};
  const projectRoots = Array.isArray(projectHub.scanRoots) ? projectHub.scanRoots : [];

  const updateGeneral = (patch) => {
    setSettings((prev) => ({
      ...(prev || {}),
      general: { ...((prev || {}).general || {}), ...patch },
    }));
  };

  const updateProjectHub = (patch) => {
    setSettings((prev) => ({
      ...(prev || {}),
      projectHub: { ...((prev || {}).projectHub || {}), ...patch },
    }));
  };

  const pickFolder = async (title, apply) => {
    const result = await window.api.pickPath({ type: 'folder', title });
    if (result.ok) apply(result.path);
  };

  const pickVSCode = async () => {
    const result = await window.api.pickVSCodeFile();
    if (result.ok) updateGeneral({ vscodePath: result.path });
  };

  const detectDownloads = async () => {
    const result = await window.api.detectDownloads();
    if (result.ok && result.path) updateGeneral({ downloadsPath: result.path });
    else toast(result.error || '無法自動偵測 Downloads', 'error');
  };

  const detectVSCode = async () => {
    const result = await window.api.detectVSCode();
    if (result.ok && result.path) updateGeneral({ vscodePath: result.path });
    else toast(result.error || '找不到 VS Code，請手動選擇 Code.exe', 'error');
  };

  const save = async (finish = false) => {
    setSaving(true);
    setError('');
    const payload = {
      ...(settings || {}),
      general: {
        ...general,
        firstRunCompleted: finish ? true : general.firstRunCompleted,
        lastSetupCheckAt: new Date().toISOString(),
      },
    };
    const result = await window.api.saveSettings(payload);
    if (result.ok) {
      setSettings(payload);
      if (window.api.restartMonitor) await window.api.restartMonitor();
      toast(finish ? '設定精靈已完成' : '設定已儲存', 'ok');
      if (finish && onNavigate) onNavigate('dashboard');
    } else {
      setError(result.error || '儲存設定失敗');
    }
    setSaving(false);
  };

  const summary = useMemo(() => {
    const rows = [
      { label: 'Downloads', value: general.downloadsPath },
      { label: 'Screenshots', value: general.screenshotsPath },
      { label: 'VS Code', value: general.vscodePath || '稍後設定' },
      { label: '專案根目錄', value: projectRoots.join(' / ') || '稍後設定' },
      { label: '監控', value: general.watchEnabled === false ? '暫不啟用' : '啟用' },
    ];
    return rows;
  }, [general, projectRoots]);

  if (!settings) {
    return (
      <div>
        <PageHeader title="設定精靈" description="正在讀取你的路徑與監控設定。" />
        <SectionPanel>
          <div className="skeleton-row" />
        </SectionPanel>
      </div>
    );
  }

  const current = STEPS[step].key;

  return (
    <div className="setup-page">
      <PageHeader
        eyebrow="SETUP"
        title="設定精靈"
        description="用幾個保守步驟確認常用路徑，讓 App 每天啟動時就能給你正確提醒。"
        actions={
          <Button variant="ghost" onClick={() => onNavigate && onNavigate('dashboard')}>
            稍後設定
          </Button>
        }
      />

      <div className="setup-steps">
        {STEPS.map((item, index) => (
          <button
            key={item.key}
            className={`step-pill ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
            onClick={() => setStep(index)}
          >
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <InlineAlert tone="danger" title="儲存失敗">
          {error}
        </InlineAlert>
      ) : null}
      {setupStatus && !setupStatus.complete ? (
        <InlineAlert tone="warn" title="尚未完成初始設定">
          你仍可直接使用 App；完成精靈後 Dashboard 的提醒會更準確。
        </InlineAlert>
      ) : null}

      {current === 'downloads' ? (
        <SectionPanel
          title="確認 Downloads"
          description="檔案整理與每日工作台會以這個資料夾作為主要來源。"
        >
          <PathPickerRow
            label="Downloads 資料夾"
            description="建議使用 Windows 預設下載資料夾，或你實際存放下載檔案的位置。"
            value={general.downloadsPath}
            onChange={(value) => updateGeneral({ downloadsPath: value })}
            onDetect={detectDownloads}
            onPick={() =>
              pickFolder('選擇 Downloads 資料夾', (path) => updateGeneral({ downloadsPath: path }))
            }
          />
        </SectionPanel>
      ) : null}

      {current === 'screenshots' ? (
        <SectionPanel
          title="確認 Screenshots"
          description="截圖整理會掃描此資料夾，並依日期與類別整理。"
        >
          <PathPickerRow
            label="Screenshots 資料夾"
            value={general.screenshotsPath}
            onChange={(value) => updateGeneral({ screenshotsPath: value })}
            onPick={() =>
              pickFolder('選擇截圖資料夾', (path) => updateGeneral({ screenshotsPath: path }))
            }
          />
        </SectionPanel>
      ) : null}

      {current === 'vscode' ? (
        <SectionPanel
          title="偵測 VS Code"
          description="Project Hub 會用這個路徑開啟專案；找不到時可以稍後設定。"
        >
          <PathPickerRow
            label="Code.exe"
            value={general.vscodePath}
            onChange={(value) => updateGeneral({ vscodePath: value })}
            onDetect={detectVSCode}
            onPick={pickVSCode}
          />
        </SectionPanel>
      ) : null}

      {current === 'projects' ? (
        <SectionPanel
          title="選擇專案掃描根目錄"
          description="Project Hub 只會掃描這些根目錄，並套用排除清單與深度設定。"
          actions={
            <Button
              size="sm"
              onClick={() =>
                pickFolder('加入專案掃描根目錄', (path) =>
                  updateProjectHub({ scanRoots: upsertRoot(projectRoots, path) }),
                )
              }
            >
              加入資料夾
            </Button>
          }
        >
          <div className="path-list">
            {projectRoots.map((root) => (
              <div className="path-list-row" key={root}>
                <span>{root}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    updateProjectHub({ scanRoots: projectRoots.filter((item) => item !== root) })
                  }
                >
                  移除
                </Button>
              </div>
            ))}
            {projectRoots.length === 0 ? (
              <InlineAlert tone="info">可以先跳過，之後從 Project Hub 再加入。</InlineAlert>
            ) : null}
          </div>
        </SectionPanel>
      ) : null}

      {current === 'monitor' ? (
        <SectionPanel
          title="啟用監控"
          description="監控會在背景追蹤資料夾變化與自動化狀態；可以隨時暫停。"
        >
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={general.watchEnabled !== false}
              onChange={(event) => updateGeneral({ watchEnabled: event.target.checked })}
            />
            <span>啟用資料夾監控與每日提醒</span>
          </label>
        </SectionPanel>
      ) : null}

      {current === 'summary' ? (
        <SectionPanel title="完成摘要" description="確認後會寫入設定，不會覆蓋你已手動指定的路徑。">
          <div className="summary-list">
            {summary.map((item) => (
              <div className="summary-row" key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.value || '稍後設定'}</span>
              </div>
            ))}
          </div>
          <div className="head-actions" style={{ marginTop: 16 }}>
            <StatusBadge tone="ok">保守設定</StatusBadge>
            <StatusBadge tone="muted">可隨時修改</StatusBadge>
          </div>
        </SectionPanel>
      ) : null}

      <div className="wizard-actions">
        <Button
          variant="ghost"
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
        >
          上一步
        </Button>
        <Button onClick={() => save(false)} busy={saving}>
          儲存目前設定
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
          >
            下一步
          </Button>
        ) : (
          <Button variant="primary" onClick={() => save(true)} busy={saving}>
            完成設定
          </Button>
        )}
      </div>
    </div>
  );
}
