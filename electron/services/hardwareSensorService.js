'use strict';

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

let attemptedCoreTempLaunch = false;
const TEMPERATURE_CACHE_MS = 2000;
const CPU_TEMP_HISTORY_LIMIT = 5;
let temperatureCache = { at: 0, data: null };
let temperatureInFlight = null;
const cpuTemperatureHistory = new Map();

function execPowerShell(script, timeout = 3500) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          resolve(JSON.parse(stdout));
        } catch (_) {
          resolve(null);
        }
      },
    );
  });
}

function execNvidiaSmi() {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,temperature.gpu', '--format=csv,noheader,nounits'],
      { timeout: 2500, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const rows = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, index) => {
            const [name, temperature] = line.split(',').map((part) => part.trim());
            const value = Number(temperature);
            return {
              id: `nvidia-${index}`,
              name: name || `GPU ${index + 1}`,
              temperatureC: Number.isFinite(value) ? value : null,
              source: 'nvidia-smi',
            };
          });
        resolve(rows);
      },
    );
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findCoreTempExe() {
  if (process.platform !== 'win32') return null;
  const candidates = [
    'C:\\Program Files\\Core Temp\\Core Temp.exe',
    'C:\\Program Files (x86)\\Core Temp\\Core Temp.exe',
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, 'Core Temp', 'Core Temp.exe')
      : '',
    process.env['ProgramFiles(x86)']
      ? path.join(process.env['ProgramFiles(x86)'], 'Core Temp', 'Core Temp.exe')
      : '',
  ].filter(Boolean);
  return (
    candidates.find((candidate) => {
      try {
        return fs.existsSync(candidate);
      } catch (_) {
        return false;
      }
    }) || null
  );
}

async function launchCoreTempOnce() {
  if (attemptedCoreTempLaunch || process.platform !== 'win32') return false;
  const exe = findCoreTempExe();
  if (!exe) return false;
  attemptedCoreTempLaunch = true;
  try {
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.on('error', () => {});
    try {
      child.unref();
    } catch (_) {
      // noop
    }
    return true;
  } catch (_) {
    return false;
  }
}

async function readCoreTempSharedMemoryOnce() {
  if (process.platform !== 'win32') return [];
  const script = String.raw`
$code = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class CoreTempSharedMemoryReader {
  const uint FILE_MAP_READ = 0x0004;

  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  static extern IntPtr OpenFileMapping(uint dwDesiredAccess, bool bInheritHandle, string lpName);

  [DllImport("kernel32.dll", SetLastError=true)]
  static extern IntPtr MapViewOfFile(IntPtr hFileMappingObject, uint dwDesiredAccess, uint dwFileOffsetHigh, uint dwFileOffsetLow, UIntPtr dwNumberOfBytesToMap);

  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool UnmapViewOfFile(IntPtr lpBaseAddress);

  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool CloseHandle(IntPtr hObject);

  [StructLayout(LayoutKind.Sequential, Pack=4, CharSet=CharSet.Ansi)]
  public struct CoreTempSharedDataEx {
    [MarshalAs(UnmanagedType.ByValArray, SizeConst=256)] public uint[] uiLoad;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst=128)] public uint[] uiTjMax;
    public uint uiCoreCnt;
    public uint uiCPUCnt;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst=256)] public float[] fTemp;
    public float fVID;
    public float fCPUSpeed;
    public float fFSBSpeed;
    public float fMultiplier;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=100)] public string sCPUName;
    public byte ucFahrenheit;
    public byte ucDeltaToTjMax;
    public byte ucTdpSupported;
    public byte ucPowerSupported;
    public uint uiStructVersion;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst=128)] public uint[] uiTdp;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst=128)] public float[] fPower;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst=256)] public float[] fMultipliers;
  }

  static string Escape(string text) {
    if (text == null) return "";
    return text.Replace("\\", "\\\\").Replace("\"", "\\\"");
  }

  public static string ReadJson() {
    string[] names = new string[] {
      "CoreTempMappingObjectEx",
      "Global\\CoreTempMappingObjectEx",
      "CoreTempMappingObject",
      "Global\\CoreTempMappingObject"
    };

    foreach (string name in names) {
      IntPtr map = OpenFileMapping(FILE_MAP_READ, false, name);
      if (map == IntPtr.Zero) continue;

      IntPtr view = IntPtr.Zero;
      try {
        view = MapViewOfFile(map, FILE_MAP_READ, 0, 0, UIntPtr.Zero);
        if (view == IntPtr.Zero) continue;

        CoreTempSharedDataEx data = (CoreTempSharedDataEx)Marshal.PtrToStructure(view, typeof(CoreTempSharedDataEx));
        int coreCount = (int)Math.Min(data.uiCoreCnt, 256);
        int cpuCount = (int)data.uiCPUCnt;
        StringBuilder sb = new StringBuilder();
        sb.Append("{");
        sb.Append("\"ok\":true,");
        sb.Append("\"mapping\":\"").Append(Escape(name)).Append("\",");
        sb.Append("\"cpuName\":\"").Append(Escape(data.sCPUName)).Append("\",");
        sb.Append("\"coreCount\":").Append(coreCount).Append(",");
        sb.Append("\"cpuCount\":").Append(cpuCount).Append(",");
        sb.Append("\"fahrenheit\":").Append(data.ucFahrenheit == 1 ? "true" : "false").Append(",");
        sb.Append("\"deltaToTjMax\":").Append(data.ucDeltaToTjMax == 1 ? "true" : "false").Append(",");
        sb.Append("\"powerSupported\":").Append(data.ucPowerSupported == 1 ? "true" : "false").Append(",");
        sb.Append("\"powers\":[");
        int powerCount = data.fPower == null ? 0 : Math.Min(data.fPower.Length, 128);
        for (int i = 0; i < powerCount; i++) {
          if (i > 0) sb.Append(",");
          float power = data.fPower[i];
          if (Single.IsNaN(power) || Single.IsInfinity(power)) sb.Append("null");
          else sb.Append(power.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }
        sb.Append("],");
        sb.Append("\"temps\":[");
        for (int i = 0; i < coreCount; i++) {
          if (i > 0) sb.Append(",");
          float raw = data.fTemp[i];
          float value = raw;
          if (data.ucDeltaToTjMax == 1 && data.uiTjMax != null && data.uiTjMax.Length > i) value = data.uiTjMax[i] - raw;
          if (data.ucFahrenheit == 1) value = (value - 32f) * 5f / 9f;
          sb.Append("{\"index\":").Append(i).Append(",\"temperatureC\":").Append(value.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append(",");
          sb.Append("\"load\":").Append(data.uiLoad != null && data.uiLoad.Length > i ? data.uiLoad[i].ToString() : "0").Append(",");
          sb.Append("\"tjMax\":").Append(data.uiTjMax != null && data.uiTjMax.Length > i ? data.uiTjMax[i].ToString() : "0").Append("}");
        }
        sb.Append("]}");
        return sb.ToString();
      } catch (Exception ex) {
        return "{\"ok\":false,\"error\":\"" + Escape(ex.Message) + "\"}";
      } finally {
        if (view != IntPtr.Zero) UnmapViewOfFile(view);
        CloseHandle(map);
      }
    }

    return "{\"ok\":false,\"error\":\"Core Temp shared memory not found\"}";
  }
}
"@
try { Add-Type -TypeDefinition $code -ErrorAction Stop | Out-Null } catch {}
[CoreTempSharedMemoryReader]::ReadJson()
`;

  const result = await execPowerShell(script, 4500);
  if (!result || !result.ok || !Array.isArray(result.temps)) return [];
  const packagePowerWatts = coreTempPackagePower(result);
  return result.temps
    .filter(
      (item) =>
        Number.isFinite(Number(item.temperatureC)) &&
        Number(item.temperatureC) > 0 &&
        Number(item.temperatureC) < 130,
    )
    .map((item) => ({
      id: `coretemp-core-${item.index}`,
      name: `Core ${Number(item.index) + 1}`,
      hardware: result.cpuName || 'Core Temp',
      temperatureC: normalizeTemp(item.temperatureC),
      loadPercent: Number(item.load) || 0,
      tjMax: Number(item.tjMax) || null,
      packagePowerWatts,
      powerSupported: result.powerSupported === true,
      kind: 'cpu',
      source: 'Core Temp',
    }));
}

async function readCoreTempSharedMemory() {
  let rows = await readCoreTempSharedMemoryOnce();
  if (rows.length) return rows;

  const launched = await launchCoreTempOnce();
  if (!launched) return rows;

  await delay(2500);
  rows = await readCoreTempSharedMemoryOnce();
  return rows;
}

function normalizeRows(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeTemp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function normalizeWatts(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function median(values) {
  const sorted = values
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function stableCoreTemperatures(cpuCores) {
  const now = Date.now();
  const activeKeys = new Set();
  const stableRows = cpuCores.map((sensor, index) => {
    const key = sensor.id || `${sensor.source || 'sensor'}:${sensor.name || index}`;
    activeKeys.add(key);
    const raw = normalizeTemp(sensor.temperatureC);
    if (raw == null) return sensor;

    const current = cpuTemperatureHistory.get(key) || [];
    current.push({ at: now, value: raw });
    const recent = current.filter((item) => now - item.at <= 30000).slice(-CPU_TEMP_HISTORY_LIMIT);
    cpuTemperatureHistory.set(key, recent);

    const stable =
      recent.length >= 3 ? normalizeTemp(median(recent.map((item) => item.value))) : raw;
    return {
      ...sensor,
      rawTemperatureC: raw,
      temperatureC: stable,
      stabilized: recent.length >= 3,
      sampleCount: recent.length,
    };
  });

  for (const [key, history] of cpuTemperatureHistory.entries()) {
    if (activeKeys.has(key)) continue;
    if (!history.length || now - history[history.length - 1].at > 60000) {
      cpuTemperatureHistory.delete(key);
    }
  }

  return stableRows;
}

function coreTempPackagePower(result) {
  if (!result || result.powerSupported !== true || !Array.isArray(result.powers)) return null;
  const rawPowers = result.powers
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 1000);
  if (!rawPowers.length) return null;

  const cpuCount = Math.max(1, Math.min(Number(result.cpuCount) || 1, rawPowers.length));
  const watts = rawPowers.slice(0, cpuCount).reduce((sum, value) => sum + value, 0);
  return normalizeWatts(watts);
}

function classifySensor(row) {
  const name = String(row.Name || row.SensorName || row.InstanceName || '').trim();
  const hardware = String(row.Parent || row.Hardware || row.HardwareName || '').trim();
  const text = `${name} ${hardware}`.toLowerCase();
  if (/gpu|graphics|nvidia|radeon|intel\(r\) arc|display/.test(text)) return 'gpu';
  if (/cpu|core|processor|package|tctl|tdie/.test(text)) return 'cpu';
  return 'other';
}

function toSensor(row, source) {
  const name = String(row.Name || row.SensorName || row.InstanceName || '').trim() || 'Temperature';
  const hardware = String(row.Parent || row.Hardware || row.HardwareName || '').trim();
  const temperatureC = normalizeTemp(row.Value || row.Temperature || row.CurrentValue);
  if (temperatureC == null) return null;
  return {
    id: `${source}:${hardware}:${name}`,
    name,
    hardware,
    temperatureC,
    kind: classifySensor(row),
    source,
  };
}

function toPowerSensor(row, source) {
  const name = String(row.Name || row.SensorName || row.InstanceName || '').trim() || 'Power';
  const hardware = String(row.Parent || row.Hardware || row.HardwareName || '').trim();
  const powerWatts = normalizeWatts(row.Value || row.Power || row.CurrentValue);
  if (powerWatts == null || powerWatts <= 0 || powerWatts >= 1000) return null;
  return {
    id: `${source}:${hardware}:${name}:power`,
    name,
    hardware,
    powerWatts,
    kind: classifySensor(row),
    source,
  };
}

async function readHardwareMonitorWmi() {
  if (process.platform !== 'win32') return [];
  const script = [
    '$namespaces = @("root\\LibreHardwareMonitor", "root\\OpenHardwareMonitor");',
    '$items = @();',
    'foreach ($ns in $namespaces) {',
    '  try {',
    '    $items += Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction Stop |',
    '      Where-Object { $_.SensorType -eq "Temperature" } |',
    '      Select-Object @{Name="Name";Expression={$_.Name}}, @{Name="Value";Expression={$_.Value}}, @{Name="Parent";Expression={$_.Parent}}, @{Name="Namespace";Expression={$ns}};',
    '  } catch {}',
    '}',
    '$items | ConvertTo-Json -Depth 4 -Compress',
  ].join(' ');
  const rows = normalizeRows(await execPowerShell(script));
  return rows.map((row) => toSensor(row, row.Namespace || 'hardware-monitor')).filter(Boolean);
}

async function readHardwareMonitorPowerWmi() {
  if (process.platform !== 'win32') return [];
  const script = [
    '$namespaces = @("root\\LibreHardwareMonitor", "root\\OpenHardwareMonitor");',
    '$items = @();',
    'foreach ($ns in $namespaces) {',
    '  try {',
    '    $items += Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction Stop |',
    '      Where-Object { $_.SensorType -eq "Power" } |',
    '      Select-Object @{Name="Name";Expression={$_.Name}}, @{Name="Value";Expression={$_.Value}}, @{Name="Parent";Expression={$_.Parent}}, @{Name="Namespace";Expression={$ns}};',
    '  } catch {}',
    '}',
    '$items | ConvertTo-Json -Depth 4 -Compress',
  ].join(' ');
  const rows = normalizeRows(await execPowerShell(script));
  return rows.map((row) => toPowerSensor(row, row.Namespace || 'hardware-monitor')).filter(Boolean);
}

async function readThermalZoneWmi() {
  if (process.platform !== 'win32') return [];
  const script = [
    'try {',
    '  Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop |',
    '    Select-Object InstanceName, @{Name="Value";Expression={[math]::Round(($_.CurrentTemperature / 10) - 273.15, 1)}} |',
    '    ConvertTo-Json -Depth 3 -Compress',
    '} catch { "" }',
  ].join(' ');
  const rows = normalizeRows(await execPowerShell(script));
  return rows
    .map((row, index) => ({
      id: `thermal-zone-${index}`,
      name: row.InstanceName || `Thermal Zone ${index + 1}`,
      hardware: 'ACPI',
      temperatureC: normalizeTemp(row.Value),
      kind: 'other',
      source: 'acpi',
    }))
    .filter((row) => row.temperatureC != null && row.temperatureC > 0 && row.temperatureC < 130);
}

function preferredCpuSensors(sensors, limit = 10) {
  const cpu = sensors.filter((sensor) => sensor.kind === 'cpu');
  const cores = cpu.filter((sensor) => /core\s*#?\s*\d+|cpu core/i.test(sensor.name));
  const selected = cores.length ? cores : cpu;
  return selected
    .sort((a, b) => {
      const aCore = Number((a.name.match(/\d+/) || [999])[0]);
      const bCore = Number((b.name.match(/\d+/) || [999])[0]);
      return aCore - bCore || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

function preferredGpuSensors(sensors, nvidiaRows) {
  const fromMonitor = sensors.filter((sensor) => sensor.kind === 'gpu');
  const fromNvidia = nvidiaRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      hardware: row.name,
      temperatureC: row.temperatureC,
      kind: 'gpu',
      source: row.source,
    }))
    .filter((row) => row.temperatureC != null);
  return [...fromNvidia, ...fromMonitor].slice(0, 6);
}

function preferredCpuPower(powerSensors) {
  const cpuPowerSensors = powerSensors.filter((sensor) => sensor.kind === 'cpu');
  const preferred =
    cpuPowerSensors.find((sensor) => /package|total|cpu/i.test(sensor.name)) ||
    cpuPowerSensors[0] ||
    null;
  return preferred
    ? {
        powerWatts: preferred.powerWatts,
        source: preferred.source,
        name: preferred.name,
      }
    : null;
}

async function readTemperaturesFresh() {
  const [coreTempSensors, monitorSensors, monitorPowerSensors, thermalZones, nvidiaRows] =
    await Promise.all([
      readCoreTempSharedMemory(),
      readHardwareMonitorWmi(),
      readHardwareMonitorPowerWmi(),
      readThermalZoneWmi(),
      execNvidiaSmi(),
    ]);
  const sensors = [...monitorSensors, ...thermalZones];
  const rawCpuCores = coreTempSensors.length
    ? coreTempSensors.slice(0, 10)
    : preferredCpuSensors(sensors, 10);
  const cpuCores = stableCoreTemperatures(rawCpuCores);
  const gpu = preferredGpuSensors(sensors, nvidiaRows);
  const coreTempPowerWatts =
    coreTempSensors.find((sensor) => sensor.packagePowerWatts != null)?.packagePowerWatts ?? null;
  const monitorCpuPower = preferredCpuPower(monitorPowerSensors);
  const cpuPower =
    coreTempPowerWatts != null
      ? { powerWatts: coreTempPowerWatts, source: 'Core Temp', name: 'CPU Package Power' }
      : monitorCpuPower;
  return {
    ok: cpuCores.length > 0 || gpu.length > 0 || thermalZones.length > 0,
    cpuCores,
    cpuTemperatureSource: coreTempSensors.length
      ? 'Core Temp'
      : cpuCores[0]
        ? cpuCores[0].source
        : '',
    cpuPowerWatts: cpuPower ? cpuPower.powerWatts : null,
    cpuPowerSource: cpuPower ? cpuPower.source : '',
    cpuPowerSensors: monitorPowerSensors.filter((sensor) => sensor.kind === 'cpu').slice(0, 8),
    gpu,
    thermalZones,
    sources: Array.from(
      new Set([
        ...coreTempSensors.map((item) => item.source),
        ...sensors.map((item) => item.source),
        ...monitorPowerSensors.map((item) => item.source),
        ...nvidiaRows.map((item) => item.source),
      ]),
    ),
    message:
      cpuCores.length || gpu.length
        ? ''
        : '未偵測到 CPU/GPU 溫度。若要顯示每核心溫度，請保持 Core Temp 執行，或執行 LibreHardwareMonitor / OpenHardwareMonitor。',
  };
}

async function getTemperatures(options = {}) {
  const now = Date.now();
  const maxAgeMs = Number.isFinite(Number(options.maxAgeMs))
    ? Math.max(0, Number(options.maxAgeMs))
    : TEMPERATURE_CACHE_MS;

  if (temperatureCache.data && maxAgeMs > 0 && now - temperatureCache.at < maxAgeMs) {
    return temperatureCache.data;
  }

  if (temperatureInFlight) return temperatureInFlight;

  temperatureInFlight = readTemperaturesFresh()
    .then((data) => {
      temperatureCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      temperatureInFlight = null;
    });

  return temperatureInFlight;
}

module.exports = {
  getTemperatures,
};
