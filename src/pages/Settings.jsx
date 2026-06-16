import React, { useEffect, useState } from 'react';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import Toggle from '../components/Toggle.jsx';
import Dialog from '../components/Dialog.jsx';
import { useToast } from '../components/Toast.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';

const inp = {
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
  { key: 'general', label: 'General', icon: '⚙️' },
  { key: 'folders', label: 'Folders', icon: '📁' },
  { key: 'appearance', label: 'Appearance', icon: '🎨' },
  { key: 'automation', label: 'Automation', icon: '⚡' },
  { key: 'advanced', label: 'Advanced', icon: '🛠️' },
];

const ACCENTS = ['#4f8cff', '#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];

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
  const [cat, setCat] = useState('general');
  const [g, setG] = useState(null); // general object
  const [autoLaunchSupported, setAutoLaunchSupported] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [configPath, setConfigPath] = useState('');

  const load = async () => {
    const res = await window.api.getSettings();
    setG(res.settings.general || {});
    setConfigPath(res.path || '');
    const al = await window.api.getAutoLaunch();
    if (al && al.ok) setAutoLaunchSupported(al.supported);
  };
  useEffect(() => { load(); }, []);

  // Persist a general patch and update local state.
  const saveGeneral = async (patch) => {
    setG((prev) => ({ ...prev, ...patch }));
    const res = await window.api.getSettings();
    await window.api.saveSettings({ ...res.settings, general: { ...(res.settings.general || {}), ...patch } });
  };

  const toggleAutoLaunch = async (v) => {
    setG((prev) => ({ ...prev, autoLaunch: v }));
    const r = await window.api.setAutoLaunch(v);
    toast(r.supported ? (v ? '已開啟開機自動啟動' : '已關閉開機自動啟動') : '已記錄（僅安裝版生效）', 'ok');
  };

  const setWatchEnabled = async (v) => { await saveGeneral({ watchEnabled: v }); await window.api.restartMonitor(); toast(v ? '已啟用檔案監控' : '已停用檔案監控', 'ok'); };

  const pickInto = async (key, type = 'folder') => {
    const r = await window.api.pickPath({ type, title: '選擇路徑' });
    if (r.ok) { await saveGeneral({ [key]: r.path }); await window.api.restartMonitor(); }
  };

  const addWatchFolder = async () => {
    const r = await window.api.pickPath({ type: 'folder', title: '選擇監控資料夾' });
    if (r.ok) { await saveGeneral({ watchFolders: [...(g.watchFolders || []), r.path] }); await window.api.restartMonitor(); }
  };
  const removeWatchFolder = async (i) => {
    await saveGeneral({ watchFolders: (g.watchFolders || []).filter((_, idx) => idx !== i) });
    await window.api.restartMonitor();
  };

  const exportSettings = async () => { const r = await window.api.exportSettings(); if (r.ok) toast(`已匯出：${r.path}`, 'ok'); else if (!r.canceled) toast(r.error || '匯出失敗', 'error'); };
  const importSettings = async () => { const r = await window.api.importSettings(); if (r.ok) { toast('已匯入設定', 'ok'); load(); } else if (!r.canceled) toast(r.error || '匯入失敗', 'error'); };
  const resetSettings = async () => { setConfirmReset(false); const r = await window.api.resetSettings(); if (r.ok) { toast('已重設為預設值', 'ok'); load(); } else toast(r.error || '重設失敗', 'error'); };

  if (!g) return <div className="loading-block"><span className="spinner" /> 載入中…</div>;

  return (
    <div>
      <h1 className="page-title">設定中心</h1>
      <p className="page-subtitle">調整一般、資料夾、外觀、自動化與進階選項。</p>

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* category nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
          {CATEGORIES.map((c) => (
            <button key={c.key} className={`nav-item ${cat === c.key ? 'active' : ''}`} onClick={() => setCat(c.key)}>
              <span className="icon">{c.icon}</span>{c.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          {cat === 'general' && (
            <Card title="General">
              <Row label="開機自動啟動" desc={autoLaunchSupported ? '登入時自動啟動並縮到系統匣' : '僅安裝版生效；開發模式不註冊'}>
                <Toggle checked={g.autoLaunch !== false} onChange={toggleAutoLaunch} />
              </Row>
              <Row label="關閉視窗時縮到系統匣" desc="關閉視窗不結束程式，改為縮到 tray">
                <Toggle checked={g.minimizeToTray !== false} onChange={(v) => saveGeneral({ minimizeToTray: v })} />
              </Row>
              <Row label="啟動時最小化" desc="啟動後不顯示視窗，直接縮到 tray">
                <Toggle checked={!!g.startMinimized} onChange={(v) => saveGeneral({ startMinimized: v })} />
              </Row>
              <Row label="啟用通知" desc="偵測到新檔案 / 規則觸發時顯示桌面通知">
                <Toggle checked={g.notifications !== false} onChange={(v) => saveGeneral({ notifications: v })} />
              </Row>
              <Row label="測試通知">
                <Button size="sm" icon="🔔" onClick={() => window.api.testNotification()}>傳送測試</Button>
              </Row>
            </Card>
          )}

          {cat === 'folders' && (
            <Card title="Folders">
              <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div className="label">Downloads 路徑</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <input style={inp} value={g.downloadsPath || ''} placeholder="留空 = 自動偵測" onChange={(e) => setG({ ...g, downloadsPath: e.target.value })} onBlur={(e) => saveGeneral({ downloadsPath: e.target.value })} />
                  <Button size="sm" icon="🧭" onClick={async () => { const r = await window.api.detectDownloads(); if (r.ok) { await saveGeneral({ downloadsPath: r.path }); toast(`已偵測：${r.path}`, 'ok'); } else toast(r.error, 'error'); }}>偵測</Button>
                  <Button size="sm" icon="📁" onClick={() => pickInto('downloadsPath')}>選擇</Button>
                </div>
              </div>
              <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="label">Screenshots 路徑</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <input style={inp} value={g.screenshotsPath || ''} placeholder="留空 = ~/Pictures/Screenshots" onChange={(e) => setG({ ...g, screenshotsPath: e.target.value })} onBlur={(e) => saveGeneral({ screenshotsPath: e.target.value })} />
                  <Button size="sm" icon="📁" onClick={() => pickInto('screenshotsPath')}>選擇</Button>
                </div>
              </div>
              <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="label">VS Code 路徑</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <input style={inp} value={g.vscodePath || ''} placeholder="留空 = 自動偵測" onChange={(e) => setG({ ...g, vscodePath: e.target.value })} onBlur={(e) => saveGeneral({ vscodePath: e.target.value })} />
                  <Button size="sm" icon="🔍" onClick={async () => { const r = await window.api.detectVSCode(); if (r.ok) { await saveGeneral({ vscodePath: r.path }); toast(`已偵測：${r.path}`, 'ok'); } else toast(r.error, 'error'); }}>偵測</Button>
                  <Button size="sm" icon="📁" onClick={() => pickInto('vscodePath', 'file')}>選擇</Button>
                  <Button size="sm" icon="🚀" onClick={async () => { const r = await window.api.testVSCode(); toast(r.ok ? `已開啟 VS Code` : r.error, r.ok ? 'ok' : 'error'); }}>測試</Button>
                </div>
              </div>
              <div style={{ paddingTop: 12 }}>
                <div className="row-between">
                  <div className="label">自訂監控資料夾</div>
                  <Button size="sm" icon="➕" onClick={addWatchFolder}>新增</Button>
                </div>
                {(g.watchFolders || []).length === 0 ? (
                  <p className="muted" style={{ fontSize: 12 }}>尚未新增。Downloads 與 Screenshots 預設會被監控。</p>
                ) : (
                  (g.watchFolders || []).map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                      <span className="path" style={{ flex: 1 }}>{f}</span>
                      <Button size="sm" variant="ghost" icon="✕" onClick={() => removeWatchFolder(i)} />
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {cat === 'appearance' && (
            <Card title="Appearance">
              <Row label="主題" desc="System / Light / Dark">
                <div style={{ display: 'flex', gap: 6 }}>
                  {['system', 'light', 'dark'].map((t) => (
                    <Button key={t} size="sm" variant={theme === t ? 'primary' : 'ghost'} onClick={() => setTheme(t)}>
                      {t === 'system' ? '系統' : t === 'light' ? '淺色' : '深色'}
                    </Button>
                  ))}
                </div>
              </Row>
              <Row label="主題色 Accent">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {ACCENTS.map((c) => (
                    <button key={c} onClick={() => setAccent(c)} title={c}
                      style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: accent === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                  <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} style={{ width: 30, height: 26, background: 'transparent', border: 'none', cursor: 'pointer' }} />
                </div>
              </Row>
              <Row label="精簡模式 Compact" desc="縮小間距，顯示更多內容">
                <Toggle checked={compact} onChange={setCompact} />
              </Row>
            </Card>
          )}

          {cat === 'automation' && (
            <Card title="Automation">
              <Row label="啟用檔案監控" desc="監控資料夾、偵測新檔案">
                <Toggle checked={g.watchEnabled !== false} onChange={setWatchEnabled} />
              </Row>
              <Row label="啟用自動化規則" desc="新檔案符合條件時自動執行動作">
                <Toggle checked={g.automationsEnabled !== false} onChange={(v) => saveGeneral({ automationsEnabled: v })} />
              </Row>
              <Row label="整理前先詢問" desc="按「確認並整理」前彈出確認對話框">
                <Toggle checked={g.askBeforeOrganizing !== false} onChange={(v) => saveGeneral({ askBeforeOrganizing: v })} />
              </Row>
              <Row label="保留操作紀錄" desc="在 Dashboard 顯示最近整理紀錄">
                <Toggle checked={g.keepHistory !== false} onChange={(v) => saveGeneral({ keepHistory: v })} />
              </Row>
            </Card>
          )}

          {cat === 'advanced' && (
            <Card title="Advanced">
              <Row label="匯出設定" desc="將設定存成 JSON 檔">
                <Button size="sm" icon="⬆️" onClick={exportSettings}>匯出</Button>
              </Row>
              <Row label="匯入設定" desc="從 JSON 檔還原設定">
                <Button size="sm" icon="⬇️" onClick={importSettings}>匯入</Button>
              </Row>
              <Row label="重設設定" desc="還原所有設定為預設值">
                <Button size="sm" variant="danger" icon="♻️" onClick={() => setConfirmReset(true)}>重設</Button>
              </Row>
              <Row label="開啟記錄資料夾" desc="查看 app.log">
                <Button size="sm" icon="📜" onClick={() => window.api.openLogs()}>開啟 Logs</Button>
              </Row>
              <Row label="開啟設定檔" desc={configPath}>
                <Button size="sm" icon="📂" onClick={() => window.api.openSettingsFile()}>開啟</Button>
              </Row>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={confirmReset}
        title="重設所有設定"
        message="這會把所有設定還原成預設值（不影響你的檔案）。確定要繼續嗎？"
        confirmLabel="重設"
        danger
        onConfirm={resetSettings}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
