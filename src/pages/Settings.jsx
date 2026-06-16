import React, { useEffect, useState } from 'react';
import ActionButton from '../components/ActionButton.jsx';

const inputStyle = {
  flex: 1,
  minWidth: 280,
  background: '#0b1220',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: '"Cascadia Code", "Consolas", monospace',
  fontSize: 13,
};

export default function Settings() {
  const [text, setText] = useState('');
  const [configPath, setConfigPath] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  // VS Code path management
  const [vscodePath, setVscodePath] = useState('');
  const [vscodeMsg, setVscodeMsg] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    if (!window.api) {
      setToast({ type: 'error', msg: '無法連接 Electron 主程序。' });
      setLoading(false);
      return;
    }
    const res = await window.api.getSettings();
    setConfigPath(res.path || '');
    setText(JSON.stringify(res.settings, null, 2));
    setVscodePath((res.settings.general && res.settings.general.vscodePath) || '');
    if (!res.ok) setToast({ type: 'error', msg: res.error });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setToast({ type: 'error', msg: `JSON 格式錯誤：${err.message}` });
      return;
    }
    const res = await window.api.saveSettings(parsed);
    if (res.ok) {
      setToast({ type: 'ok', msg: `已儲存到 ${res.path}` });
      setVscodePath((parsed.general && parsed.general.vscodePath) || '');
    } else {
      setToast({ type: 'error', msg: res.error || '儲存失敗' });
    }
  };

  const openFile = async () => {
    await window.api.openSettingsFile();
  };

  // Persist only general.vscodePath without disturbing the rest of the config.
  const persistVscodePath = async (newPath) => {
    const res = await window.api.getSettings();
    const next = {
      ...res.settings,
      general: { ...(res.settings.general || {}), vscodePath: newPath },
    };
    const r = await window.api.saveSettings(next);
    if (r.ok) {
      setText(JSON.stringify(next, null, 2)); // keep JSON editor in sync
    }
    return r;
  };

  const saveVscodePath = async () => {
    const r = await persistVscodePath(vscodePath.trim());
    setVscodeMsg(r.ok ? { type: 'ok', msg: '已儲存 VS Code 路徑。' } : { type: 'error', msg: r.error || '儲存失敗' });
  };

  const detectVscode = async () => {
    setDetecting(true);
    setVscodeMsg(null);
    const r = await window.api.detectVSCode();
    setDetecting(false);
    if (r.ok) {
      setVscodePath(r.path);
      const saved = await persistVscodePath(r.path);
      setVscodeMsg(
        saved.ok
          ? { type: 'ok', msg: `已自動偵測並儲存：${r.path}` }
          : { type: 'error', msg: saved.error || '偵測成功但儲存失敗' }
      );
    } else {
      setVscodeMsg({ type: 'error', msg: r.error || '找不到 VS Code，請手動選擇 Code.exe。' });
    }
  };

  const testVscode = async () => {
    setTesting(true);
    setVscodeMsg(null);
    // Persist any manual edit first so the test uses what's in the box.
    if (vscodePath.trim()) await persistVscodePath(vscodePath.trim());
    const r = await window.api.testVSCode();
    setTesting(false);
    setVscodeMsg(
      r.ok
        ? { type: 'ok', msg: `已開啟 VS Code：${r.path}` }
        : { type: 'error', msg: r.error || '測試失敗' }
    );
  };

  const pickVscode = async () => {
    setVscodeMsg(null);
    const r = await window.api.pickVSCodeFile();
    if (r.canceled) return;
    if (r.ok) {
      setVscodePath(r.path);
      const saved = await persistVscodePath(r.path);
      setVscodeMsg(
        saved.ok
          ? { type: 'ok', msg: `已選擇並儲存：${r.path}` }
          : { type: 'error', msg: saved.error || '選擇成功但儲存失敗' }
      );
    } else {
      setVscodeMsg({ type: 'error', msg: r.error || '選擇檔案失敗' });
    }
  };

  return (
    <div>
      <h1 className="page-title">設定</h1>
      <p className="page-subtitle">
        設定 VS Code 路徑，或直接編輯 JSON 設定檔（modes / projects / general）。儲存後立即生效。
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row-between" style={{ marginBottom: 6 }}>
          <span className="muted">設定檔位置</span>
          <ActionButton variant="ghost" icon="📂" onClick={openFile}>
            用系統開啟
          </ActionButton>
        </div>
        <div className="path">{configPath || '—'}</div>
      </div>

      {/* VS Code 路徑 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">VS Code 路徑</div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          「寫程式模式」會用這個路徑開啟 VS Code。可手動輸入、自動偵測，或選擇 <code>Code.exe</code>。留空時會自動偵測常見安裝位置。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input
            style={inputStyle}
            value={vscodePath}
            placeholder="例如 C:\\Users\\Jeremy\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"
            onChange={(e) => setVscodePath(e.target.value)}
            spellCheck={false}
          />
          <ActionButton icon="🔍" busy={detecting} onClick={detectVscode}>
            自動偵測
          </ActionButton>
          <ActionButton icon="📁" onClick={pickVscode}>
            選擇檔案
          </ActionButton>
          <ActionButton variant="primary" icon="💾" onClick={saveVscodePath}>
            儲存路徑
          </ActionButton>
          <ActionButton icon="🚀" busy={testing} onClick={testVscode}>
            測試開啟
          </ActionButton>
        </div>
        {vscodeMsg ? <div className={`toast ${vscodeMsg.type}`}>{vscodeMsg.msg}</div> : null}
      </div>

      {loading ? (
        <p>
          <span className="spinner" /> 載入中…
        </p>
      ) : (
        <>
          <textarea
            className="config-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          <div className="button-row" style={{ marginTop: 14 }}>
            <ActionButton variant="primary" icon="💾" onClick={save}>
              儲存設定
            </ActionButton>
            <ActionButton variant="ghost" icon="↩️" onClick={load}>
              還原（重新載入）
            </ActionButton>
          </div>
          {toast ? <div className={`toast ${toast.type}`}>{toast.msg}</div> : null}
        </>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-title">欄位說明</div>
        <ul className="muted" style={{ lineHeight: 1.8, marginTop: 4 }}>
          <li>
            <code>general.vscodePath</code>：VS Code 執行檔路徑（寫程式模式優先使用；留空則自動偵測）。
          </li>
          <li>
            <code>general.downloadsPath</code>：自訂 Downloads 路徑（留空則用使用者家目錄）。
          </li>
          <li>
            <code>general.monitorDrives</code>：要監控的磁碟陣列，例如{' '}
            <code>["C:\\", "D:\\"]</code>；空陣列 <code>[]</code> 會自動偵測所有可用磁碟。（仍相容舊的{' '}
            <code>monitorDrive</code> 單一字串設定。）
          </li>
          <li>
            <code>modes[]</code>：工作模式，含 apps / folders / urls / commands。urls 請勿放{' '}
            <code>http://localhost:5173</code>（那是 App 內部開發網址）。
          </li>
          <li>
            <code>projects[]</code>：要追蹤 Git 的專案，含 path / gitReminderHours / backupReminderHours。
          </li>
          <li>Windows 路徑請使用雙反斜線，例如 <code>D:\\Projects\\codex</code>。</li>
        </ul>
      </div>
    </div>
  );
}
