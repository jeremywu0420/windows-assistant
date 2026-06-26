'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Build service — compiles/simulates a detected EE project and streams output.
 *
 * - Read-mostly: compiles or simulates only. It never flashes/uploads to a device
 *   (that is a separate, explicitly-confirmed action) and writes build intermediates
 *   to the OS temp dir so the project folder stays clean.
 * - One build runs at a time.
 */

let activeProc = null;

function listFiles(dir, ext) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(ext))
      .map((f) => path.join(dir, f));
  } catch (_) {
    return [];
  }
}

function tmp(name) {
  return path.join(os.tmpdir(), `pcla-${Date.now()}-${name}`);
}

// Inspect a folder and return how it would build. No execution.
function detectBuild(folderPath) {
  const base = { supported: false, type: '', label: '', steps: [], hint: '' };
  if (!folderPath) return { ...base, error: '未提供資料夾路徑' };
  let stat;
  try {
    stat = fs.statSync(folderPath);
  } catch (_) {
    return { ...base, error: `找不到資料夾：${folderPath}` };
  }
  if (!stat.isDirectory()) return { ...base, error: '路徑不是資料夾' };

  const ino = listFiles(folderPath, '.ino');
  const v = listFiles(folderPath, '.v');
  const vhd = [...listFiles(folderPath, '.vhd'), ...listFiles(folderPath, '.vhdl')];
  const m = listFiles(folderPath, '.m');
  const hasCMake = fs.existsSync(path.join(folderPath, 'CMakeLists.txt'));

  if (ino.length) {
    return {
      supported: true,
      type: 'arduino',
      label: 'Arduino (arduino-cli compile)',
      hint: '',
      steps: [
        {
          cmd: 'arduino-cli',
          args: ['compile', '--fqbn', 'arduino:avr:uno', folderPath],
          cwd: folderPath,
        },
      ],
    };
  }
  if (v.length) {
    const out = tmp('sim.out');
    return {
      supported: true,
      type: 'verilog',
      label: 'Verilog (iverilog + vvp)',
      hint: '',
      steps: [
        { cmd: 'iverilog', args: ['-o', out, ...v], cwd: folderPath },
        { cmd: 'vvp', args: [out], cwd: folderPath },
      ],
    };
  }
  if (vhd.length) {
    const workdir = tmp('ghdl-work');
    try {
      fs.mkdirSync(workdir, { recursive: true });
    } catch (_) {
      /* ignore */
    }
    return {
      supported: true,
      type: 'vhdl',
      label: 'VHDL (ghdl -a analyze)',
      hint: '',
      steps: [{ cmd: 'ghdl', args: ['-a', `--workdir=${workdir}`, ...vhd], cwd: folderPath }],
    };
  }
  if (m.length) {
    return {
      supported: true,
      type: 'octave',
      label: 'MATLAB/Octave (octave)',
      hint: '',
      steps: [{ cmd: 'octave', args: ['--no-gui', '--norc', m[0]], cwd: folderPath }],
    };
  }
  if (hasCMake) {
    const build = tmp('cmake-build');
    return {
      supported: true,
      type: 'cmake',
      label: 'C/C++ (CMake + Ninja)',
      hint: '',
      steps: [
        { cmd: 'cmake', args: ['-S', folderPath, '-B', build, '-G', 'Ninja'], cwd: folderPath },
        { cmd: 'cmake', args: ['--build', build], cwd: folderPath },
      ],
    };
  }

  return { ...base, error: '未偵測到可編譯的專案（.ino / .v / .vhd / .m / CMakeLists.txt）' };
}

function runStep(step, onData) {
  return new Promise((resolve) => {
    onData({ stream: 'system', text: `$ ${step.cmd} ${step.args.join(' ')}` });
    let proc;
    try {
      proc = spawn(step.cmd, step.args, { cwd: step.cwd, windowsHide: true });
    } catch (err) {
      onData({ stream: 'stderr', text: `無法執行 ${step.cmd}：${err.message}` });
      resolve({ ok: false, code: -1 });
      return;
    }
    activeProc = proc;
    proc.stdout.on('data', (d) => onData({ stream: 'stdout', text: d.toString() }));
    proc.stderr.on('data', (d) => onData({ stream: 'stderr', text: d.toString() }));
    proc.on('error', (err) => {
      const hint =
        err.code === 'ENOENT' ? `（找不到 ${step.cmd}，請到「環境健檢」確認已安裝並在 PATH）` : '';
      onData({ stream: 'stderr', text: `${err.message} ${hint}` });
      activeProc = null;
      resolve({ ok: false, code: -1 });
    });
    proc.on('close', (code) => {
      activeProc = null;
      resolve({ ok: code === 0, code });
    });
  });
}

// Run all steps in sequence; stop on the first failure. `onData` streams output.
async function runBuild(folderPath, onData) {
  if (activeProc) return { ok: false, error: '已有編譯正在執行中' };
  const plan = detectBuild(folderPath);
  if (!plan.supported) {
    onData({ stream: 'system', text: plan.error || '無法編譯' });
    return { ok: false, error: plan.error };
  }
  onData({ stream: 'system', text: `偵測到：${plan.label}` });
  for (const step of plan.steps) {
    const r = await runStep(step, onData);
    if (!r.ok) {
      onData({ stream: 'system', text: `✗ 失敗（exit ${r.code}）` });
      return { ok: false, code: r.code };
    }
  }
  onData({ stream: 'system', text: '✓ 完成' });
  return { ok: true };
}

// One-click flash — compiles and uploads to a connected board. This DOES write
// to hardware, so the renderer gates it behind an explicit confirm dialog.
// Currently supports Arduino (arduino-cli upload); other types are no-ops.
async function flash(folderPath, port, onData) {
  if (activeProc) return { ok: false, error: '已有工作正在執行中' };
  const plan = detectBuild(folderPath);
  if (plan.type !== 'arduino') {
    onData({ stream: 'system', text: '一鍵燒錄目前僅支援 Arduino 專案（.ino）' });
    return { ok: false, error: '僅支援 Arduino 專案' };
  }
  if (!/^COM\d+$/i.test(String(port || ''))) {
    onData({ stream: 'system', text: '無效的連接埠（需為 COMx）' });
    return { ok: false, error: '無效的連接埠' };
  }
  onData({ stream: 'system', text: `燒錄到 ${port}…` });
  const step = {
    cmd: 'arduino-cli',
    args: ['upload', '-p', port, '--fqbn', 'arduino:avr:uno', folderPath],
    cwd: folderPath,
  };
  const r = await runStep(step, onData);
  onData({ stream: 'system', text: r.ok ? '✓ 燒錄完成' : `✗ 燒錄失敗（exit ${r.code}）` });
  return r;
}

function cancelBuild() {
  if (activeProc) {
    try {
      activeProc.kill();
    } catch (_) {
      /* ignore */
    }
    activeProc = null;
    return { ok: true };
  }
  return { ok: false, error: '沒有正在執行的編譯' };
}

module.exports = { detectBuild, runBuild, flash, cancelBuild };
