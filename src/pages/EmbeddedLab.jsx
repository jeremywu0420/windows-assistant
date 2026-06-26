import React, { useEffect, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import Button from '../components/Button.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfirmDangerDialog from '../components/ConfirmDangerDialog.jsx';
import { useToast } from '../components/Toast.jsx';

const BAUDS = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 250000];
const MAX_LINES = 2000;

const consoleStyle = {
  fontFamily: '"Cascadia Code","Consolas",monospace',
  fontSize: 12.5,
  lineHeight: 1.5,
  background: '#0d1117',
  color: '#d6deeb',
  borderRadius: 10,
  padding: 12,
  height: 280,
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  border: '1px solid var(--border)',
};
const selectStyle = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text)',
};
const colorFor = (stream) =>
  stream === 'stderr' || stream === 'error'
    ? '#ff7b72'
    : stream === 'system'
      ? '#7ee787'
      : '#d6deeb';

function Console({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div style={consoleStyle} ref={ref}>
      {lines.length === 0 ? (
        <span style={{ opacity: 0.5 }}>（尚無輸出）</span>
      ) : (
        lines.map((l, i) => (
          <span key={i} style={{ color: colorFor(l.stream) }}>
            {l.text}
          </span>
        ))
      )}
    </div>
  );
}

export default function EmbeddedLab() {
  const { toast } = useToast();

  // --- Build ---
  const [folder, setFolder] = useState('');
  const [detected, setDetected] = useState(null);
  const [building, setBuilding] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [confirmFlash, setConfirmFlash] = useState(false);
  const [buildLines, setBuildLines] = useState([]);

  // --- Serial ---
  const [ports, setPorts] = useState([]);
  const [port, setPort] = useState('');
  const [baud, setBaud] = useState(9600);
  const [connected, setConnected] = useState(false);
  const [serialLines, setSerialLines] = useState([]);

  const append = (setter) => (chunk) =>
    setter((prev) => {
      const next = [...prev, chunk];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });

  useEffect(() => {
    if (!window.api) return undefined;
    const offBuild = window.api.onBuildOutput?.(append(setBuildLines));
    const offSerial = window.api.onSerialData?.(append(setSerialLines));
    return () => {
      offBuild && offBuild();
      offSerial && offSerial();
    };
  }, []);

  // Best-effort: refresh port list on mount.
  useEffect(() => {
    refreshPorts(); /* eslint-disable-next-line */
  }, []);

  const pickFolder = async () => {
    const r = await window.api?.pickPath?.({ type: 'folder', title: '選擇專案資料夾' });
    if (r?.ok) {
      setFolder(r.path);
      setBuildLines([]);
      const det = await window.api.detectBuild(r.path);
      setDetected(det);
    }
  };

  const build = async () => {
    if (!folder) return;
    setBuilding(true);
    setBuildLines([]);
    try {
      const r = await window.api.runBuild(folder);
      if (r?.ok) toast('編譯完成', 'ok');
      else toast(r?.error || '編譯失敗', 'error');
    } finally {
      setBuilding(false);
    }
  };

  const cancelBuild = async () => {
    await window.api.cancelBuild();
    setBuilding(false);
  };

  const isArduino = detected?.type === 'arduino';
  const canFlash = isArduino && !!port && !building && !flashing && !connected;

  const doFlash = async () => {
    setConfirmFlash(false);
    setFlashing(true);
    setBuildLines([]);
    try {
      const r = await window.api.flashBuild({ folderPath: folder, port });
      if (r?.ok) toast('燒錄完成', 'ok');
      else toast(r?.error || '燒錄失敗', 'error');
    } finally {
      setFlashing(false);
    }
  };

  const refreshPorts = async () => {
    const r = await window.api?.listSerialPorts?.();
    const list = r?.ports || [];
    setPorts(list);
    if (list.length && !list.find((p) => p.path === port)) setPort(list[0].path);
  };

  const connect = async () => {
    if (!port) {
      toast('請先選擇連接埠', 'error');
      return;
    }
    setSerialLines([]);
    const r = await window.api.openSerial({ port, baud: Number(baud) });
    if (r?.ok) {
      setConnected(true);
    } else toast(r?.error || '連線失敗', 'error');
  };

  const disconnect = async () => {
    await window.api.closeSerial();
    setConnected(false);
  };

  return (
    <div>
      <PageHeader
        eyebrow="EMBEDDED"
        title="嵌入式工具"
        description="編譯／模擬 Arduino、Verilog、VHDL、Octave 與 CMake 專案，並監看序列埠輸出。需要對應工具鏈（見「環境健檢」）。"
      />

      <SectionPanel
        title="編譯 / 模擬"
        eyebrow="BUILD"
        description="選擇專案資料夾，自動偵測類型並編譯／模擬。Arduino 專案可一鍵燒錄（需先在下方序列埠選擇 COM 並保持未連線）。"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={pickFolder}>選擇資料夾</Button>
            {building ? (
              <Button variant="danger" onClick={cancelBuild}>
                取消
              </Button>
            ) : (
              <Button variant="primary" onClick={build} disabled={!folder || !detected?.supported}>
                編譯
              </Button>
            )}
            {isArduino ? (
              <Button
                variant="danger"
                onClick={() => setConfirmFlash(true)}
                disabled={!canFlash}
                busy={flashing}
                title={
                  connected
                    ? '請先關閉序列埠連線'
                    : !port
                      ? '請在下方序列埠選擇 COM'
                      : '編譯並燒錄到裝置'
                }
              >
                燒錄
              </Button>
            ) : null}
          </div>
        }
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          <code
            style={{
              fontFamily: '"Cascadia Code","Consolas",monospace',
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {folder || '尚未選擇資料夾'}
          </code>
          {detected ? (
            detected.supported ? (
              <StatusBadge tone="ok">{detected.label}</StatusBadge>
            ) : (
              <StatusBadge tone="warn">{detected.error || '不支援'}</StatusBadge>
            )
          ) : null}
        </div>
        <Console lines={buildLines} />
      </SectionPanel>

      <SectionPanel
        title="序列埠監控"
        eyebrow="SERIAL"
        description="列出 COM 連接埠並即時顯示輸入資料（唯讀監看）。"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              style={selectStyle}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={connected}
            >
              {ports.length === 0 ? (
                <option value="">無連接埠</option>
              ) : (
                ports.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.label}
                  </option>
                ))
              )}
            </select>
            <select
              style={selectStyle}
              value={baud}
              onChange={(e) => setBaud(Number(e.target.value))}
              disabled={connected}
            >
              {BAUDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <Button onClick={refreshPorts} disabled={connected}>
              重新整理
            </Button>
            {connected ? (
              <Button variant="danger" onClick={disconnect}>
                關閉
              </Button>
            ) : (
              <Button variant="primary" onClick={connect} disabled={!port}>
                連線
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSerialLines([])}>
              清除
            </Button>
          </div>
        }
      >
        <div style={{ marginBottom: 8 }}>
          <StatusBadge tone={connected ? 'ok' : 'muted'}>
            {connected ? `已連線 ${port} @ ${baud}` : '未連線'}
          </StatusBadge>
        </div>
        <Console lines={serialLines} />
      </SectionPanel>

      <ConfirmDangerDialog
        open={confirmFlash}
        title="確認燒錄到裝置"
        message={`即將編譯並把「${folder}」燒錄到 ${port}。此動作會寫入實體裝置，確定要繼續嗎？`}
        confirmLabel="開始燒錄"
        onConfirm={doFlash}
        onCancel={() => setConfirmFlash(false)}
      />
    </div>
  );
}
