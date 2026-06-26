import React, { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Dialog from '../components/Dialog.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Toggle from '../components/Toggle.jsx';
import { useToast } from '../components/Toast.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { useLocale } from '../i18n.jsx';

const inputStyle = {
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  fontFamily: '"Cascadia Code","Consolas",monospace',
  flex: 1,
  minWidth: 220,
};

const CATEGORIES = [
  { key: 'general', label: '一般', icon: 'GE' },
  { key: 'paths', label: '路徑', icon: 'PA' },
  { key: 'startup', label: '開機/喚醒', icon: 'ST' },
  { key: 'guard', label: '監控守護', icon: 'HG' },
  { key: 'overlay', label: 'Overlay', icon: 'OS' },
  { key: 'cleanup', label: '清理', icon: 'CC' },
  { key: 'automation', label: '自動化', icon: 'AU' },
  { key: 'backup', label: '備份/還原', icon: 'BK' },
];

const ACCENTS = ['#2f81f7', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

function Row({ label, desc, children }) {
  return (
    <div className="setting-row">
      <div>
        <div className="label">{label}</div>
        {desc ? <div className="desc">{desc}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { theme, setTheme, accent, setAccent, compact, setCompact } = useTheme();
  const { language, setLanguage, t } = useLocale();
  const [category, setCategory] = useState('general');
  const [settings, setSettings] = useState(null);
  const [autoLaunchSupported, setAutoLaunchSupported] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [configPath, setConfigPath] = useState('');

  const general = settings?.general || {};
  const guard = settings?.healthGuard || {};
  const cleanup = settings?.cleanup || {};
  const overlay = settings?.overlay || {};

  const load = async () => {
    const result = await window.api.getSettings();
    setSettings(result.settings);
    setConfigPath(result.path || '');
    const autoLaunch = await window.api.getAutoLaunch();
    if (autoLaunch?.ok) setAutoLaunchSupported(autoLaunch.supported);
  };

  useEffect(() => {
    load();
  }, []);

  const saveAll = async (next) => {
    setSettings(next);
    const result = await window.api.saveSettings(next);
    if (!result.ok) toast(result.error || '設定儲存失敗', 'error');
    return result;
  };

  const saveGeneral = async (patch) => {
    const next = { ...settings, general: { ...general, ...patch } };
    await saveAll(next);
  };

  const saveCleanup = async (patch) => {
    const next = { ...settings, cleanup: { ...cleanup, ...patch } };
    await saveAll(next);
    if (window.api.cleanup?.getSettings && window.api.cleanup?.saveSettings) {
      const current = await window.api.cleanup.getSettings();
      await window.api.cleanup.saveSettings({ ...(current.settings || {}), ...patch });
    }
  };

  const saveGuard = async (patch) => {
    const nextGuard = { ...guard, ...patch };
    const next = { ...settings, healthGuard: nextGuard };
    setSettings(next);
    const result = await window.api.saveHealthGuard(nextGuard);
    toast(
      result.ok ? '健康守護設定已更新' : result.error || '儲存失敗',
      result.ok ? 'ok' : 'error',
    );
  };

  const saveOverlay = async (patch) => {
    const nextOverlay = { ...overlay, ...patch };
    const next = { ...settings, overlay: nextOverlay };
    setSettings(next);
    if (window.api.overlay?.saveSettings) {
      const result = await window.api.overlay.saveSettings(patch);
      if (result?.settings) setSettings({ ...next, overlay: result.settings });
      if (!result?.ok) toast(result?.error || 'Overlay 設定儲存失敗', 'error');
      return result;
    }
    return saveAll(next);
  };

  const toggleAutoLaunch = async (enabled) => {
    const result = await window.api.setAutoLaunch(enabled);
    if (result?.ok || result?.supported) await saveGeneral({ autoLaunch: enabled });
    toast(
      result.supported
        ? enabled
          ? '已啟用開機自動啟動'
          : '已停用開機自動啟動'
        : '此環境不支援開機自動啟動',
      result.supported ? 'ok' : 'warn',
    );
  };

  const setWatchEnabled = async (enabled) => {
    await saveGeneral({ watchEnabled: enabled });
    await window.api.restartMonitor();
    toast(enabled ? '資料夾監控已啟用' : '資料夾監控已停用', 'ok');
  };

  const pickInto = async (key, type = 'folder') => {
    const result = await window.api.pickPath({ type, title: '選擇路徑' });
    if (result.ok) {
      await saveGeneral({ [key]: result.path });
      await window.api.restartMonitor();
      toast('路徑已更新', 'ok');
    }
  };

  const exportSettings = async () => {
    const result = await window.api.exportSettings();
    if (result.ok) toast(`已匯出設定：${result.path}`, 'ok');
    else if (!result.canceled) toast(result.error || '匯出失敗', 'error');
  };

  const importSettings = async () => {
    const result = await window.api.importSettings();
    if (result.ok) {
      toast('設定已匯入', 'ok');
      load();
    } else if (!result.canceled) {
      toast(result.error || '匯入失敗', 'error');
    }
  };

  const resetSettings = async () => {
    setConfirmReset(false);
    const result = await window.api.resetSettings();
    toast(result.ok ? '設定已重置' : result.error || '重置失敗', result.ok ? 'ok' : 'error');
    if (result.ok) load();
  };

  if (!settings) {
    return (
      <div className="loading-block">
        <span className="spinner" />
        載入設定...
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="PREFERENCES"
        title="設定中心"
        description="管理路徑、開機喚醒、背景守護、自動化與備份還原。"
        actions={
          <StatusBadge tone={general.watchEnabled !== false ? 'ok' : 'warn'}>
            {general.watchEnabled !== false ? '監控啟用' : '監控停用'}
          </StatusBadge>
        }
      />

      <div className="settings-layout">
        <div className="settings-nav">
          {CATEGORIES.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${category === item.key ? 'active' : ''}`}
              onClick={() => setCategory(item.key)}
              type="button"
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="settings-content">
          {category === 'general' ? (
            <Card title="一般">
              <Row label="桌面通知" desc="用於健康守護、自動化、清理建議與更新提醒。">
                <Toggle
                  checked={general.notifications !== false}
                  onChange={(enabled) => saveGeneral({ notifications: enabled })}
                />
              </Row>
              <Row label={t('settings.languageLabel')} desc={t('settings.languageDesc')}>
                <div className="inline-controls">
                  <Button
                    size="sm"
                    variant={language === 'zh' ? 'primary' : 'ghost'}
                    onClick={() => setLanguage('zh')}
                  >
                    {t('settings.chinese')}
                  </Button>
                  <Button
                    size="sm"
                    variant={language === 'en' ? 'primary' : 'ghost'}
                    onClick={() => setLanguage('en')}
                  >
                    {t('settings.english')}
                  </Button>
                </div>
              </Row>
              <Row label="主題">
                <div className="inline-controls">
                  {['system', 'light', 'dark'].map((item) => (
                    <Button
                      key={item}
                      size="sm"
                      variant={theme === item ? 'primary' : 'ghost'}
                      onClick={() => setTheme(item)}
                    >
                      {item === 'system' ? '系統' : item === 'light' ? '淺色' : '深色'}
                    </Button>
                  ))}
                </div>
              </Row>
              <Row label="強調色">
                <div className="swatch-row">
                  {ACCENTS.map((color) => (
                    <button
                      key={color}
                      className={`swatch ${accent === color ? 'active' : ''}`}
                      onClick={() => setAccent(color)}
                      title={color}
                      style={{ background: color }}
                      type="button"
                    />
                  ))}
                  <input
                    type="color"
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                  />
                </div>
              </Row>
              <Row label="緊湊模式" desc="降低間距，讓列表與工具頁顯示更多資料。">
                <Toggle checked={compact} onChange={setCompact} />
              </Row>
              <Row label="測試通知">
                <Button size="sm" onClick={() => window.api.testNotification()}>
                  測試
                </Button>
              </Row>
            </Card>
          ) : null}

          {category === 'paths' ? (
            <Card title="路徑">
              <Row label="Downloads 路徑">
                <div className="inline-controls">
                  <input
                    style={inputStyle}
                    value={general.downloadsPath || ''}
                    onChange={(event) => saveGeneral({ downloadsPath: event.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      const result = await window.api.detectDownloads();
                      if (result.ok) await saveGeneral({ downloadsPath: result.path });
                    }}
                  >
                    自動偵測
                  </Button>
                  <Button size="sm" onClick={() => pickInto('downloadsPath')}>
                    選擇
                  </Button>
                </div>
              </Row>
              <Row label="Screenshots 路徑">
                <div className="inline-controls">
                  <input
                    style={inputStyle}
                    value={general.screenshotsPath || ''}
                    onChange={(event) => saveGeneral({ screenshotsPath: event.target.value })}
                  />
                  <Button size="sm" onClick={() => pickInto('screenshotsPath')}>
                    選擇
                  </Button>
                </div>
              </Row>
              <Row label="VS Code 路徑">
                <div className="inline-controls">
                  <input
                    style={inputStyle}
                    value={general.vscodePath || ''}
                    onChange={(event) => saveGeneral({ vscodePath: event.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      const result = await window.api.detectVSCode();
                      if (result.ok) await saveGeneral({ vscodePath: result.path });
                      toast(
                        result.ok ? `偵測到 ${result.path}` : result.error,
                        result.ok ? 'ok' : 'error',
                      );
                    }}
                  >
                    自動偵測
                  </Button>
                  <Button size="sm" onClick={() => pickInto('vscodePath', 'file')}>
                    選擇
                  </Button>
                </div>
              </Row>
            </Card>
          ) : null}

          {category === 'startup' ? (
            <Card title="開機/喚醒">
              <Row
                label="開機自動啟動"
                desc={
                  autoLaunchSupported
                    ? '登入 Windows 後自動啟動 PC Life Assistant。'
                    : '目前環境不支援此設定。'
                }
              >
                <Toggle checked={general.autoLaunch !== false} onChange={toggleAutoLaunch} />
              </Row>
              <Row label="開機後顯示介面" desc="登入或重開機後直接跳出主畫面。">
                <Toggle
                  checked={general.showOnStartup !== false}
                  onChange={(enabled) =>
                    saveGeneral({ showOnStartup: enabled, startMinimized: !enabled })
                  }
                />
              </Row>
              <Row
                label="螢幕/睡眠恢復後顯示介面"
                desc="電腦喚醒、解鎖或從閒置回到使用時顯示每日工作台。"
              >
                <Toggle
                  checked={general.showOnResume !== false}
                  onChange={(enabled) => saveGeneral({ showOnResume: enabled })}
                />
              </Row>
              <Row label="關閉視窗時縮到系統匣">
                <Toggle
                  checked={general.minimizeToTray !== false}
                  onChange={(enabled) => saveGeneral({ minimizeToTray: enabled })}
                />
              </Row>
            </Card>
          ) : null}

          {category === 'guard' ? (
            <Card title="背景健康守護">
              <Row label="啟用健康守護" desc="定期檢查溫度、RAM 與磁碟容量，超過門檻會通知。">
                <Toggle
                  checked={guard.enabled !== false}
                  onChange={(enabled) => saveGuard({ enabled })}
                />
              </Row>
              <Row label="檢查間隔（分鐘）">
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={guard.intervalMinutes || 5}
                  onChange={(event) => saveGuard({ intervalMinutes: Number(event.target.value) })}
                />
              </Row>
              <Row label="通知冷卻（分鐘）">
                <input
                  style={inputStyle}
                  type="number"
                  min="5"
                  value={guard.cooldownMinutes || 30}
                  onChange={(event) => saveGuard({ cooldownMinutes: Number(event.target.value) })}
                />
              </Row>
              <Row label="CPU 溫度警戒（°C）">
                <input
                  style={inputStyle}
                  type="number"
                  value={guard.cpuTempC || 85}
                  onChange={(event) => saveGuard({ cpuTempC: Number(event.target.value) })}
                />
              </Row>
              <Row label="GPU 溫度警戒（°C）">
                <input
                  style={inputStyle}
                  type="number"
                  value={guard.gpuTempC || 85}
                  onChange={(event) => saveGuard({ gpuTempC: Number(event.target.value) })}
                />
              </Row>
              <Row label="RAM 使用率警戒（%）">
                <input
                  style={inputStyle}
                  type="number"
                  value={guard.ramPercent || 85}
                  onChange={(event) => saveGuard({ ramPercent: Number(event.target.value) })}
                />
              </Row>
              <Row label="磁碟剩餘容量警戒（GB）">
                <input
                  style={inputStyle}
                  type="number"
                  value={guard.diskFreeGb || 50}
                  onChange={(event) => saveGuard({ diskFreeGb: Number(event.target.value) })}
                />
              </Row>
              <Row label="立即檢查">
                <Button
                  size="sm"
                  onClick={async () => {
                    const result = await window.api.checkHealthGuardNow();
                    toast(
                      result.ok
                        ? `檢查完成，觸發 ${result.fired?.length || 0} 個通知`
                        : result.error || '檢查失敗',
                      result.ok ? 'ok' : 'error',
                    );
                  }}
                >
                  執行
                </Button>
              </Row>
            </Card>
          ) : null}

          {category === 'overlay' ? (
            <Card title="System Monitoring Overlay">
              <Row label="啟用 Overlay" desc="建立透明、置頂、預設滑鼠穿透的螢幕監控視窗。">
                <Toggle
                  checked={overlay.enabled === true}
                  onChange={(enabled) => saveOverlay({ enabled })}
                />
              </Row>
              <Row label="顯示 FPS" desc="目前保留 PresentMon / RTSS 接入口；未接入時會顯示 N/A。">
                <Toggle
                  checked={overlay.showFps !== false}
                  onChange={(showFps) => saveOverlay({ showFps })}
                />
              </Row>
              <Row label="顯示 CPU">
                <Toggle
                  checked={overlay.showCpu !== false}
                  onChange={(showCpu) => saveOverlay({ showCpu })}
                />
              </Row>
              <Row label="顯示 GPU">
                <Toggle
                  checked={overlay.showGpu !== false}
                  onChange={(showGpu) => saveOverlay({ showGpu })}
                />
              </Row>
              <Row label="顯示 RAM">
                <Toggle
                  checked={overlay.showRam !== false}
                  onChange={(showRam) => saveOverlay({ showRam })}
                />
              </Row>
              <Row label="更新頻率">
                <select
                  style={inputStyle}
                  value={overlay.updateIntervalMs || 1000}
                  onChange={(event) =>
                    saveOverlay({ updateIntervalMs: Number(event.target.value) })
                  }
                >
                  <option value={500}>500 ms</option>
                  <option value={1000}>1000 ms</option>
                  <option value={2000}>2000 ms</option>
                </select>
              </Row>
              <Row label="字體大小">
                <input
                  style={inputStyle}
                  type="number"
                  min="10"
                  max="28"
                  value={overlay.fontSize || 14}
                  onChange={(event) => saveOverlay({ fontSize: Number(event.target.value) })}
                />
              </Row>
              <Row label="透明度">
                <div className="inline-controls overlay-range">
                  <input
                    type="range"
                    min="0.35"
                    max="1"
                    step="0.05"
                    value={overlay.opacity ?? 0.92}
                    onChange={(event) => saveOverlay({ opacity: Number(event.target.value) })}
                  />
                  <span>{Math.round((overlay.opacity ?? 0.92) * 100)}%</span>
                </div>
              </Row>
              <Row label="顯示位置" desc="預設在主要螢幕左上角，日後可擴充為選擇指定螢幕。">
                <div className="inline-controls">
                  {[
                    ['top-left', '左上'],
                    ['top-right', '右上'],
                    ['bottom-left', '左下'],
                    ['bottom-right', '右下'],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={(overlay.position || 'top-left') === value ? 'primary' : 'ghost'}
                      onClick={() => saveOverlay({ position: value })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </Row>
              <Row
                label="滑鼠穿透"
                desc="開啟時不影響點擊其他程式；關閉後可拖曳 Overlay 位置。快捷鍵：Ctrl + Alt + Shift + O"
              >
                <Toggle
                  checked={overlay.clickThrough !== false}
                  onChange={(clickThrough) => saveOverlay({ clickThrough })}
                />
              </Row>
              <Row label="隨 App 啟動顯示" desc="保留給開機啟動流程使用；Overlay 開關會被保存。">
                <Toggle
                  checked={overlay.autoStart === true}
                  onChange={(autoStart) => saveOverlay({ autoStart })}
                />
              </Row>
              <Row label="立即控制">
                <div className="inline-controls">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await window.api.overlay?.show?.();
                      load();
                    }}
                  >
                    顯示 Overlay
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await window.api.overlay?.hide?.();
                      load();
                    }}
                  >
                    關閉 Overlay
                  </Button>
                </div>
              </Row>
            </Card>
          ) : null}

          {category === 'cleanup' ? (
            <Card title="Clean Center">
              <Row
                label="安全模式"
                desc="保守清理，避免近期暫存、Installer、Driver、Windows Update 相關檔案。"
              >
                <Toggle
                  checked={cleanup.safeMode !== false}
                  onChange={(enabled) => saveCleanup({ safeMode: enabled })}
                />
              </Row>
              <Row label="清理前顯示報告">
                <Toggle
                  checked={cleanup.showCleanupReport !== false}
                  onChange={(enabled) => saveCleanup({ showCleanupReport: enabled })}
                />
              </Row>
              <Row label="寫入詳細紀錄">
                <Toggle
                  checked={cleanup.writeDetailedLog !== false}
                  onChange={(enabled) => saveCleanup({ writeDetailedLog: enabled })}
                />
              </Row>
            </Card>
          ) : null}

          {category === 'automation' ? (
            <Card title="自動化">
              <Row label="資料夾監控">
                <Toggle checked={general.watchEnabled !== false} onChange={setWatchEnabled} />
              </Row>
              <Row label="啟用自動化規則">
                <Toggle
                  checked={general.automationsEnabled !== false}
                  onChange={(enabled) => saveGeneral({ automationsEnabled: enabled })}
                />
              </Row>
              <Row label="保留操作歷史">
                <Toggle
                  checked={general.keepHistory !== false}
                  onChange={(enabled) => saveGeneral({ keepHistory: enabled })}
                />
              </Row>
            </Card>
          ) : null}

          {category === 'backup' ? (
            <Card title="備份/還原">
              <Row label="匯出設定">
                <Button size="sm" onClick={exportSettings}>
                  匯出
                </Button>
              </Row>
              <Row label="匯入設定">
                <Button size="sm" onClick={importSettings}>
                  匯入
                </Button>
              </Row>
              <Row label="重置設定">
                <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
                  重置
                </Button>
              </Row>
              <Row label="開啟 Logs">
                <Button size="sm" onClick={() => window.api.openLogs()}>
                  開啟
                </Button>
              </Row>
              <Row label="設定檔位置" desc={configPath}>
                <Button size="sm" onClick={() => window.api.openSettingsFile()}>
                  開啟設定檔
                </Button>
              </Row>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog
        open={confirmReset}
        title="重置設定"
        message="這會把 App 設定還原為預設值，但不會刪除你的檔案。"
        confirmLabel="重置"
        cancelLabel="取消"
        danger
        onConfirm={resetSettings}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
