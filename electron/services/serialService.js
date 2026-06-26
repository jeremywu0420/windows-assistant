'use strict';

const { spawn, execFile } = require('child_process');

/**
 * Serial Monitor service (Windows) — lists COM ports and streams incoming data.
 *
 * - No native dependency: drives `System.IO.Ports.SerialPort` through PowerShell,
 *   matching the app's dependency-light style.
 * - Read-only monitor: it opens a port and forwards bytes; it does not write to the
 *   device. One session at a time; closing kills the reader so the port is released.
 */

let activeProc = null;

const PS = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command'];

function listPorts() {
  const script = `
$ports = [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object -Unique
$info = @{}
try { Get-CimInstance Win32_SerialPort -ErrorAction Stop | ForEach-Object { $info[$_.DeviceID] = $_.Name } } catch {}
$out = @($ports | ForEach-Object { [pscustomobject]@{ path = $_; label = $info[$_] } })
ConvertTo-Json -Compress -InputObject $out
`;
  return new Promise((resolve) => {
    execFile('powershell', [...PS, script], { timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve({ ok: true, ports: [] });
      try {
        const parsed = JSON.parse(stdout.trim());
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const ports = arr
          .filter((p) => p && p.path)
          .map((p) => ({ path: p.path, label: p.label || p.path }));
        resolve({ ok: true, ports });
      } catch (_) {
        resolve({ ok: true, ports: [] });
      }
    });
  });
}

function isValidPort(p) {
  return /^COM\d+$/i.test(String(p || ''));
}
function isValidBaud(b) {
  return Number.isInteger(Number(b)) && Number(b) > 0 && Number(b) <= 2000000;
}

// Open a port and stream data via onData({ stream, text }). Returns immediately.
function openPort({ port, baud }, onData) {
  if (activeProc) return { ok: false, error: '已有連線，請先關閉' };
  if (!isValidPort(port)) return { ok: false, error: '無效的連接埠' };
  if (!isValidBaud(baud)) return { ok: false, error: '無效的鮑率' };

  const b = Number(baud);
  const script = `
$port = New-Object System.IO.Ports.SerialPort '${port}', ${b}, 'None', 8, 'One'
$port.ReadTimeout = 500
try { $port.Open() } catch { [Console]::Error.WriteLine('OPEN_FAIL: ' + $_.Exception.Message); exit 1 }
[Console]::Out.WriteLine('__CONNECTED__')
while ($true) {
  try { $s = $port.ReadExisting(); if ($s.Length -gt 0) { [Console]::Out.Write($s) } } catch {}
  Start-Sleep -Milliseconds 40
}
`;
  let proc;
  try {
    proc = spawn('powershell', [...PS, script], { windowsHide: true });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  activeProc = proc;

  proc.stdout.on('data', (d) => {
    const text = d.toString();
    if (text.includes('__CONNECTED__')) {
      onData({ stream: 'system', text: `已連線 ${port} @ ${b}` });
      const rest = text.replace('__CONNECTED__', '').replace(/^\r?\n/, '');
      if (rest) onData({ stream: 'data', text: rest });
      return;
    }
    onData({ stream: 'data', text });
  });
  proc.stderr.on('data', (d) => onData({ stream: 'error', text: d.toString() }));
  proc.on('close', () => {
    if (activeProc === proc) activeProc = null;
    onData({ stream: 'system', text: '連線已關閉' });
  });

  return { ok: true };
}

function closePort() {
  if (activeProc) {
    try {
      activeProc.kill();
    } catch (_) {
      /* ignore */
    }
    activeProc = null;
    return { ok: true };
  }
  return { ok: false, error: '沒有開啟的連線' };
}

module.exports = { listPorts, openPort, closePort };
