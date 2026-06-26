'use strict';

const { execFile } = require('child_process');

const POWERSHELL = 'powershell.exe';
const POWERSHELL_BASE_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
];
const UTF8_PREAMBLE =
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false);';

const COMMANDS = Object.freeze({
  defenderStatus: 'Get-MpComputerStatus | ConvertTo-Json -Depth 4 -Compress',
  firewallStatus:
    'Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction | ConvertTo-Json -Depth 4 -Compress',
  accountProtection: String.raw`
$uac = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name EnableLUA -ErrorAction SilentlyContinue
$passport = Get-Service -Name NgcSvc -ErrorAction SilentlyContinue
$keyIso = Get-Service -Name KeyIso -ErrorAction SilentlyContinue
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
[pscustomobject]@{
  UserName = $identity.Name
  IsAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  UacEnabled = ($uac.EnableLUA -eq 1)
  PassportServiceStatus = if ($passport) { [string]$passport.Status } else { $null }
  KeyIsolationServiceStatus = if ($keyIso) { [string]$keyIso.Status } else { $null }
} | ConvertTo-Json -Depth 4 -Compress
`,
  appBrowserControl: String.raw`
$mp = Get-MpPreference -ErrorAction Stop
$explorer = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' -ErrorAction SilentlyContinue
$edgePolicy = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' -ErrorAction SilentlyContinue
[pscustomobject]@{
  SmartScreenEnabled = $explorer.EnableSmartScreen
  SmartScreenLevel = $explorer.SmartScreenEnabled
  EdgeSmartScreenPolicy = $edgePolicy.SmartScreenEnabled
  PUAProtection = $mp.PUAProtection
  EnableControlledFolderAccess = $mp.EnableControlledFolderAccess
  CloudBlockLevel = $mp.CloudBlockLevel
  SubmitSamplesConsent = $mp.SubmitSamplesConsent
} | ConvertTo-Json -Depth 4 -Compress
`,
  deviceSecurity: String.raw`
$tpm = Get-Tpm -ErrorAction SilentlyContinue
$secureBoot = $null
$secureBootSupported = $true
try {
  $secureBoot = Confirm-SecureBootUEFI -ErrorAction Stop
} catch {
  $secureBootSupported = $false
}
$deviceGuard = Get-CimInstance -Namespace 'root\Microsoft\Windows\DeviceGuard' -ClassName Win32_DeviceGuard -ErrorAction SilentlyContinue
$hvcPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity'
$hvc = Get-ItemProperty -Path $hvcPath -Name Enabled -ErrorAction SilentlyContinue
$bitLocker = Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue
$systemDrive = $env:SystemDrive
$volume = if ($bitLocker) { Get-BitLockerVolume -MountPoint $systemDrive -ErrorAction SilentlyContinue } else { $null }
[pscustomobject]@{
  TpmPresent = if ($tpm) { $tpm.TpmPresent } else { $null }
  TpmReady = if ($tpm) { $tpm.TpmReady } else { $null }
  SecureBootSupported = $secureBootSupported
  SecureBootEnabled = $secureBoot
  MemoryIntegrityEnabled = if ($hvc) { $hvc.Enabled } else { $null }
  VirtualizationBasedSecurityStatus = if ($deviceGuard) { $deviceGuard.VirtualizationBasedSecurityStatus } else { $null }
  SecurityServicesRunning = if ($deviceGuard) { $deviceGuard.SecurityServicesRunning } else { @() }
  BitLockerProtectionStatus = if ($volume) { [string]$volume.ProtectionStatus } else { $null }
  BitLockerVolumeStatus = if ($volume) { [string]$volume.VolumeStatus } else { $null }
} | ConvertTo-Json -Depth 6 -Compress
`,
  devicePerformanceHealth: String.raw`
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'" -ErrorAction SilentlyContinue
$lastHotFix = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 1
$battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
$freePercent = if ($disk -and $disk.Size) { [math]::Round(($disk.FreeSpace / $disk.Size) * 100, 1) } else { $null }
$uptimeDays = if ($os.LastBootUpTime) { [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 1) } else { $null }
[pscustomobject]@{
  OsCaption = $os.Caption
  OsVersion = $os.Version
  LastBootUpTime = $os.LastBootUpTime
  UptimeDays = $uptimeDays
  SystemDrive = $env:SystemDrive
  SystemDriveFreePercent = $freePercent
  SystemDriveFreeGB = if ($disk) { [math]::Round($disk.FreeSpace / 1GB, 1) } else { $null }
  LastHotFixId = if ($lastHotFix) { $lastHotFix.HotFixID } else { $null }
  LastHotFixInstalledOn = if ($lastHotFix) { $lastHotFix.InstalledOn } else { $null }
  BatteryStatus = if ($battery) { $battery.BatteryStatus } else { $null }
  BatteryEstimatedChargeRemaining = if ($battery) { $battery.EstimatedChargeRemaining } else { $null }
} | ConvertTo-Json -Depth 4 -Compress
`,
  familyOptions: String.raw`
$wpc = Get-Service -Name WpcMonSvc -ErrorAction SilentlyContinue
$accounts = Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True" -ErrorAction SilentlyContinue |
  Select-Object Name,Disabled,PasswordRequired,PasswordExpires,Lockout
[pscustomobject]@{
  ParentalControlsServiceStatus = if ($wpc) { [string]$wpc.Status } else { $null }
  ParentalControlsServiceStartType = if ($wpc) { [string]$wpc.StartType } else { $null }
  LocalAccountCount = @($accounts).Count
  EnabledLocalAccountCount = @($accounts | Where-Object { -not $_.Disabled }).Count
  PasswordRequiredAccountCount = @($accounts | Where-Object { $_.PasswordRequired }).Count
  LockedOutAccountCount = @($accounts | Where-Object { $_.Lockout }).Count
} | ConvertTo-Json -Depth 4 -Compress
`,
  protectionHistory: String.raw`
$threats = @(Get-MpThreat -ErrorAction SilentlyContinue)
$detections = @(Get-MpThreatDetection -ErrorAction SilentlyContinue | Sort-Object InitialDetectionTime -Descending | Select-Object -First 8)
[pscustomobject]@{
  ThreatCount = $threats.Count
  ActiveThreatCount = @($threats | Where-Object { $_.IsActive }).Count
  RecentDetectionCount = $detections.Count
  RecentDetections = $detections | Select-Object ThreatName,ActionSuccess,InitialDetectionTime,LastThreatStatusChangeTime,Resources
} | ConvertTo-Json -Depth 6 -Compress
`,
  quickScan: 'Start-MpScan -ScanType QuickScan',
  updateSignature: 'Update-MpSignature',
});

function unsupportedOs() {
  return {
    ok: false,
    code: 'UNSUPPORTED_OS',
    error: 'Security Center only supports Windows system data.',
  };
}

function classifyPowerShellError(err, stdout = '', stderr = '', options = {}) {
  const combined =
    `${err && err.message ? err.message : ''}\n${stdout || ''}\n${stderr || ''}`.toLowerCase();

  if (err && (err.code === 'ENOENT' || err.path === POWERSHELL)) {
    return {
      code: 'POWERSHELL_NOT_FOUND',
      error: 'PowerShell is not available on this system.',
    };
  }

  if (
    combined.includes('access is denied') ||
    combined.includes('unauthorized') ||
    combined.includes('permission') ||
    combined.includes('privilege') ||
    combined.includes('administrator') ||
    combined.includes('not have sufficient')
  ) {
    return {
      code: 'PERMISSION_DENIED',
      error: 'Windows denied access to this security command.',
    };
  }

  if (combined.includes('get-netfirewallprofile')) {
    return {
      code: 'FIREWALL_COMMAND_UNAVAILABLE',
      error: 'Windows Firewall PowerShell commands are unavailable.',
    };
  }

  if (
    combined.includes('not recognized') ||
    combined.includes('not installed') ||
    combined.includes('get-mpcomputerstatus') ||
    combined.includes('start-mpscan') ||
    combined.includes('update-mpsignature') ||
    combined.includes('defender')
  ) {
    return {
      code: 'DEFENDER_COMMAND_UNAVAILABLE',
      error: 'Windows Defender PowerShell commands are unavailable.',
    };
  }

  if (options.unavailableCode && combined.includes('not recognized')) {
    return {
      code: options.unavailableCode,
      error: options.unavailableError || 'This Windows security command is unavailable.',
    };
  }

  return {
    code: 'POWERSHELL_FAILED',
    error: err && err.message ? err.message : 'PowerShell command failed.',
  };
}

function runPowerShell(command, options = {}) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(unsupportedOs());
      return;
    }

    execFile(
      POWERSHELL,
      [...POWERSHELL_BASE_ARGS, `${UTF8_PREAMBLE} ${command}`],
      {
        timeout: options.timeout || 20000,
        windowsHide: true,
        maxBuffer: options.maxBuffer || 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          const mapped = classifyPowerShellError(err, stdout, stderr, options);
          resolve({
            ok: false,
            ...mapped,
            detail: String(stderr || stdout || err.message || '').trim(),
          });
          return;
        }

        resolve({
          ok: true,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
        });
      },
    );
  });
}

async function runJson(command, label) {
  const result = await runPowerShell(command);
  if (!result.ok) return result;

  try {
    return {
      ok: true,
      data: result.stdout ? parsePowerShellJson(result.stdout) : null,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'JSON_PARSE_FAILED',
      error: `Could not parse ${label} PowerShell JSON output.`,
      detail: err.message,
    };
  }
}

function parsePowerShellJson(raw) {
  return JSON.parse(raw, (_key, value) => {
    if (typeof value !== 'string') return value;
    const match = value.match(/^\/Date\((-?\d+)\)\/$/);
    if (!match) return value;
    const date = new Date(Number(match[1]));
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  });
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickDefenderFields(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    AntivirusEnabled: data.AntivirusEnabled,
    RealTimeProtectionEnabled: data.RealTimeProtectionEnabled,
    AMServiceEnabled: data.AMServiceEnabled,
    AntivirusSignatureLastUpdated: data.AntivirusSignatureLastUpdated,
    QuickScanAge: data.QuickScanAge,
    FullScanAge: data.FullScanAge,
  };
}

function normalizeFirewallProfiles(data) {
  return toArray(data).map((profile) => ({
    Name: profile.Name,
    Enabled: profile.Enabled,
    DefaultInboundAction: profile.DefaultInboundAction,
    DefaultOutboundAction: profile.DefaultOutboundAction,
  }));
}

async function getDefenderStatus() {
  const result = await runJson(COMMANDS.defenderStatus, 'Defender');
  if (!result.ok) return result;
  return {
    ok: true,
    data: pickDefenderFields(result.data),
    raw: result.data,
  };
}

async function getFirewallStatus() {
  const result = await runJson(COMMANDS.firewallStatus, 'Firewall');
  if (!result.ok) return result;
  return {
    ok: true,
    profiles: normalizeFirewallProfiles(result.data),
    raw: result.data,
  };
}

async function getAccountProtection() {
  return runJson(COMMANDS.accountProtection, 'Account protection');
}

async function getAppBrowserControl() {
  return runJson(COMMANDS.appBrowserControl, 'App and browser control');
}

async function getDeviceSecurity() {
  return runJson(COMMANDS.deviceSecurity, 'Device security');
}

async function getDevicePerformanceHealth() {
  return runJson(COMMANDS.devicePerformanceHealth, 'Device performance and health');
}

async function getFamilyOptions() {
  return runJson(COMMANDS.familyOptions, 'Family options');
}

async function getProtectionHistory() {
  return runJson(COMMANDS.protectionHistory, 'Protection history');
}

async function getSecurityStatus() {
  if (process.platform !== 'win32') {
    return {
      ...unsupportedOs(),
      generatedAt: new Date().toISOString(),
      platform: process.platform,
    };
  }

  const [
    defender,
    firewall,
    accountProtection,
    appBrowserControl,
    deviceSecurity,
    devicePerformanceHealth,
    familyOptions,
    protectionHistory,
  ] = await Promise.all([
    getDefenderStatus(),
    getFirewallStatus(),
    getAccountProtection(),
    getAppBrowserControl(),
    getDeviceSecurity(),
    getDevicePerformanceHealth(),
    getFamilyOptions(),
    getProtectionHistory(),
  ]);

  return {
    ok: [
      defender,
      firewall,
      accountProtection,
      appBrowserControl,
      deviceSecurity,
      devicePerformanceHealth,
      familyOptions,
      protectionHistory,
    ].some((item) => item && item.ok),
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    defender,
    firewall,
    accountProtection,
    appBrowserControl,
    deviceSecurity,
    devicePerformanceHealth,
    familyOptions,
    protectionHistory,
    errors: [
      defender,
      firewall,
      accountProtection,
      appBrowserControl,
      deviceSecurity,
      devicePerformanceHealth,
      familyOptions,
      protectionHistory,
    ]
      .filter((item) => item && !item.ok)
      .map((item) => ({
        code: item.code,
        error: item.error,
        detail: item.detail,
      })),
  };
}

async function startQuickScan() {
  return runPowerShell(COMMANDS.quickScan, { timeout: 30000 });
}

async function updateSignatures() {
  return runPowerShell(COMMANDS.updateSignature, { timeout: 120000 });
}

module.exports = {
  COMMANDS,
  getSecurityStatus,
  startQuickScan,
  updateSignatures,
};
