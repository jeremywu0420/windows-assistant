'use strict';

const { execFile } = require('child_process');

/**
 * Toolchain Doctor service.
 *
 * - Read only: only runs `where <cmd>` and `<cmd> --version`-style probes.
 * - Reports, for each dev/EE toolchain, whether it is installed, its version,
 *   the resolved path, and an install hint.
 * - Degrades gracefully: a missing tool is a normal result, never an error.
 */

// Each tool: how to detect presence (`where`) and read a version string.
// `versionArgs` is chosen per tool; output may land on stdout or stderr.
const TOOLS = [
  // Core
  {
    id: 'node',
    label: 'Node.js',
    group: 'Core',
    cmd: 'node',
    versionArgs: ['--version'],
    hint: 'winget install OpenJS.NodeJS',
  },
  {
    id: 'npm',
    label: 'npm',
    group: 'Core',
    cmd: 'npm',
    versionArgs: ['--version'],
    hint: 'Bundled with Node.js',
  },
  {
    id: 'git',
    label: 'Git',
    group: 'Core',
    cmd: 'git',
    versionArgs: ['--version'],
    hint: 'winget install Git.Git',
  },
  {
    id: 'python',
    label: 'Python',
    group: 'Core',
    cmd: 'python',
    versionArgs: ['--version'],
    hint: 'winget install Python.Python.3.13',
  },

  // Embedded / microcontroller
  {
    id: 'arduino-cli',
    label: 'Arduino CLI',
    group: 'Embedded',
    cmd: 'arduino-cli',
    versionArgs: ['version'],
    hint: 'winget install ArduinoSA.CLI',
  },
  {
    id: 'arm-none-eabi-gcc',
    label: 'ARM GCC (arm-none-eabi-gcc)',
    group: 'Embedded',
    cmd: 'arm-none-eabi-gcc',
    versionArgs: ['--version'],
    hint: 'winget install Arm.ArmGnuToolchain',
  },
  {
    id: 'openocd',
    label: 'OpenOCD',
    group: 'Embedded',
    cmd: 'openocd',
    versionArgs: ['--version'],
    hint: 'winget install xpack.openocd',
  },

  // HDL / FPGA simulation
  {
    id: 'iverilog',
    label: 'Icarus Verilog (iverilog)',
    group: 'HDL',
    cmd: 'iverilog',
    versionArgs: ['-V'],
    hint: 'https://bleyer.org/icarus/',
  },
  {
    id: 'vvp',
    label: 'Icarus runtime (vvp)',
    group: 'HDL',
    cmd: 'vvp',
    versionArgs: ['-V'],
    hint: 'Bundled with Icarus Verilog',
  },
  {
    id: 'ghdl',
    label: 'GHDL (VHDL)',
    group: 'HDL',
    cmd: 'ghdl',
    versionArgs: ['--version'],
    hint: 'winget install ghdl.ghdl.ucrt64.mcode',
  },

  // Build systems
  {
    id: 'cmake',
    label: 'CMake',
    group: 'Build',
    cmd: 'cmake',
    versionArgs: ['--version'],
    hint: 'winget install Kitware.CMake',
  },
  {
    id: 'ninja',
    label: 'Ninja',
    group: 'Build',
    cmd: 'ninja',
    versionArgs: ['--version'],
    hint: 'winget install Ninja-build.Ninja',
  },

  // EDA / numerical
  {
    id: 'kicad-cli',
    label: 'KiCad CLI',
    group: 'EDA',
    cmd: 'kicad-cli',
    versionArgs: ['version'],
    hint: 'winget install KiCad.KiCad',
  },
  {
    id: 'octave',
    label: 'GNU Octave',
    group: 'Numerical',
    cmd: 'octave',
    versionArgs: ['--version'],
    hint: 'winget install GNU.Octave',
  },
];

const GROUP_ORDER = ['Core', 'Embedded', 'HDL', 'Build', 'EDA', 'Numerical'];

function run(cmd, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        err,
        out: `${stdout || ''}\n${stderr || ''}`.trim(),
      });
    });
  });
}

// Version probe via `cmd /c` on Windows so `.cmd` shims (e.g. npm) resolve too,
// without the security/deprecation caveats of spawning with shell:true.
function runVersion(cmd, args) {
  if (process.platform === 'win32') {
    return run('cmd', ['/c', cmd, ...args]);
  }
  return run(cmd, args);
}

// Resolve the first path for a command via Windows `where` (returns '' if absent).
async function which(cmd) {
  const { err, out } = await run('where', [cmd], 4000);
  if (err || !out) return '';
  const first = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0];
  return first || '';
}

// Pull a version-looking token (e.g. 24.16.0, 1.9, v2.43) out of raw output.
function parseVersion(raw) {
  if (!raw) return '';
  const m = raw.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
  return m ? m[1] : '';
}

async function checkTool(tool) {
  const base = {
    id: tool.id,
    label: tool.label,
    group: tool.group,
    cmd: tool.cmd,
    installed: false,
    version: '',
    path: '',
    detail: '',
    hint: tool.hint,
  };

  const resolvedPath = await which(tool.cmd);
  if (!resolvedPath) return base;

  base.installed = true;
  base.path = resolvedPath;

  const { out } = await runVersion(tool.cmd, tool.versionArgs);
  if (out) {
    base.detail = out.split(/\r?\n/)[0].trim();
    base.version = parseVersion(out);
  }
  return base;
}

async function checkAll() {
  const results = [];
  // Run sequentially to avoid spawning a burst of processes at once.
  for (const tool of TOOLS) {
    results.push(await checkTool(tool));
  }

  const groups = GROUP_ORDER.map((name) => ({
    name,
    tools: results.filter((r) => r.group === name),
  })).filter((g) => g.tools.length > 0);

  const installed = results.filter((r) => r.installed).length;
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    total: results.length,
    installed,
    missing: results.length - installed,
    groups,
    tools: results,
  };
}

module.exports = {
  TOOLS,
  checkAll,
  checkTool,
};
