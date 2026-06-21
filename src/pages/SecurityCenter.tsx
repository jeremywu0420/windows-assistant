import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import SecurityCard from '../components/SecurityCard.tsx';
import { useToast } from '../components/Toast.jsx';
import {
  getSecurityStatus,
  openFirewallSettings,
  openWindowsSecurity,
  runQuickScan,
  updateSignatures,
} from '../services/securityService.ts';

function LineIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

const icons = {
  shield: (
    <LineIcon>
      <path d="M12 3 20 7v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z" />
    </LineIcon>
  ),
  firewall: (
    <LineIcon>
      <path d="M4 20V8l4-2 4 2 4-2 4 2v12" />
      <path d="M4 12h16M8 6v14M16 6v14" />
    </LineIcon>
  ),
  account: (
    <LineIcon>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </LineIcon>
  ),
  browser: (
    <LineIcon>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 9h16M9 15l2 2 4-5" />
    </LineIcon>
  ),
  device: (
    <LineIcon>
      <rect x="5" y="5" width="14" height="12" rx="2" />
      <path d="M9 21h6M12 17v4" />
    </LineIcon>
  ),
  health: (
    <LineIcon>
      <path d="M20 12a8 8 0 0 0-16 0c0 5 8 9 8 9s8-4 8-9z" />
      <path d="M8 12h2l2-4 2 8 2-4h2" />
    </LineIcon>
  ),
  family: (
    <LineIcon>
      <circle cx="9" cy="8" r="3" />
      <circle cx="16" cy="10" r="2.5" />
      <path d="M3 21a6 6 0 0 1 12 0M13 21a5 5 0 0 1 8 0" />
    </LineIcon>
  ),
  history: (
    <LineIcon>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M4 5v5h5M12 8v5l3 2" />
    </LineIcon>
  ),
};

const STATUS_LABEL = {
  normal: '不需採取動作',
  warning: '建議檢查',
  unavailable: '需要系統權限或不支援',
};

function isEnabled(value) {
  if (value === true || value === 1) return true;
  const text = String(value || '').toLowerCase();
  return text === 'true' || text === '1' || text === 'enabled' || text === 'on' || text === 'running';
}

function isDisabled(value) {
  if (value === false || value === 0) return true;
  const text = String(value || '').toLowerCase();
  return text === 'false' || text === '0' || text === 'disabled' || text === 'off' || text === 'stopped';
}

function boolText(value) {
  if (isEnabled(value)) return '啟用';
  if (isDisabled(value)) return '停用';
  if (value == null || value === '') return '--';
  return String(value);
}

function valueText(value) {
  if (value == null || value === '') return '--';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '--';
  return String(value);
}

function formatDate(value) {
  if (!value) return '--';
  const match = String(value).match(/^\/Date\((-?\d+)\)\/$/);
  const date = match ? new Date(Number(match[1])) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function detailRows(rows) {
  return (
    <dl className="security-detail-list">
      {rows.map((row) => (
        <div key={row.label} className={row.wide ? 'wide' : ''}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function profileByName(profiles = [], name) {
  return profiles.find((profile) => String(profile.Name || '').toLowerCase() === name.toLowerCase());
}

function statusDescription(status) {
  return STATUS_LABEL[status] || STATUS_LABEL.unavailable;
}

function defenderStatus(defender) {
  if (!defender?.ok || !defender.data) return 'unavailable';
  const data = defender.data;
  return isEnabled(data.AntivirusEnabled) && isEnabled(data.RealTimeProtectionEnabled) && isEnabled(data.AMServiceEnabled)
    ? 'normal'
    : 'warning';
}

function firewallStatus(firewall) {
  if (!firewall?.ok || !firewall.profiles?.length) return 'unavailable';
  return firewall.profiles.every((profile) => isEnabled(profile.Enabled)) ? 'normal' : 'warning';
}

function accountStatus(account) {
  if (!account?.ok || !account.data) return 'unavailable';
  return isEnabled(account.data.UacEnabled) ? 'normal' : 'warning';
}

function appBrowserStatus(appBrowser) {
  if (!appBrowser?.ok || !appBrowser.data) return 'unavailable';
  const data = appBrowser.data;
  const smartScreenOff = isDisabled(data.SmartScreenEnabled) || String(data.SmartScreenLevel || '').toLowerCase() === 'off';
  const puaOff = isDisabled(data.PUAProtection);
  return smartScreenOff || puaOff ? 'warning' : 'normal';
}

function deviceSecurityStatus(device) {
  if (!device?.ok || !device.data) return 'unavailable';
  const data = device.data;
  if (data.TpmPresent === false || data.TpmReady === false || data.SecureBootEnabled === false) return 'warning';
  return 'normal';
}

function performanceStatus(performance) {
  if (!performance?.ok || !performance.data) return 'unavailable';
  const data = performance.data;
  const lowDisk = Number(data.SystemDriveFreePercent) < 15;
  const longUptime = Number(data.UptimeDays) > 30;
  return lowDisk || longUptime ? 'warning' : 'normal';
}

function familyStatus(family) {
  if (!family?.ok || !family.data) return 'unavailable';
  return Number(family.data.LockedOutAccountCount || 0) > 0 ? 'warning' : 'normal';
}

function historyStatus(history) {
  if (!history?.ok || !history.data) return 'unavailable';
  return Number(history.data.ActiveThreatCount || 0) > 0 ? 'warning' : 'normal';
}

function errorMessage(result) {
  if (!result) return '';
  if (result.code === 'UNSUPPORTED_OS') return '目前不是 Windows 系統，無法讀取 Windows 安全性資料。';
  if (result.code === 'POWERSHELL_NOT_FOUND') return '找不到 PowerShell，無法讀取本機安全性狀態。';
  if (result.code === 'DEFENDER_COMMAND_UNAVAILABLE') return 'Defender PowerShell 指令不可用，可能未安裝或被原則限制。';
  if (result.code === 'FIREWALL_COMMAND_UNAVAILABLE') return '防火牆 PowerShell 指令不可用，可能被系統原則限制。';
  if (result.code === 'PERMISSION_DENIED') return '權限不足，請以允許讀取安全性狀態的帳戶執行。';
  if (result.code === 'JSON_PARSE_FAILED') return 'PowerShell 回傳格式無法解析，請稍後重試。';
  return result.error || '';
}

export default function SecurityCenter() {
  const { toast } = useToast();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getSecurityStatus();
    setState(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const defender = state?.defender;
  const firewall = state?.firewall;
  const account = state?.accountProtection;
  const appBrowser = state?.appBrowserControl;
  const device = state?.deviceSecurity;
  const performance = state?.devicePerformanceHealth;
  const family = state?.familyOptions;
  const history = state?.protectionHistory;

  const defenderData = defender?.data || {};
  const profiles = firewall?.profiles || [];
  const domain = profileByName(profiles, 'Domain');
  const privateProfile = profileByName(profiles, 'Private');
  const publicProfile = profileByName(profiles, 'Public');

  const tones = {
    defender: defenderStatus(defender),
    firewall: firewallStatus(firewall),
    account: accountStatus(account),
    appBrowser: appBrowserStatus(appBrowser),
    device: deviceSecurityStatus(device),
    performance: performanceStatus(performance),
    family: familyStatus(family),
    history: historyStatus(history),
  };

  const topErrors = useMemo(() => {
    const rows = [];
    if (state && !state.ok) rows.push(errorMessage(state));
    for (const item of state?.errors || []) rows.push(errorMessage(item));
    return Array.from(new Set(rows.filter(Boolean)));
  }, [state]);

  const overallTone = Object.values(tones).includes('warning')
    ? 'warning'
    : Object.values(tones).some((tone) => tone === 'normal')
    ? 'normal'
    : 'unavailable';

  const runAction = async (name, fn, success) => {
    setAction(name);
    const result = await fn();
    setAction('');
    toast(result?.ok ? success : errorMessage(result) || '操作失敗', result?.ok ? 'ok' : 'error');
    if (result?.ok && (name === 'quickScan' || name === 'updateSignatures')) refresh();
  };

  const accountData = account?.data || {};
  const appData = appBrowser?.data || {};
  const deviceData = device?.data || {};
  const performanceData = performance?.data || {};
  const familyData = family?.data || {};
  const historyData = history?.data || {};

  return (
    <div className="security-center-page">
      <div className="page-head security-head">
        <div>
          <p className="eyebrow">SECURITY CENTER</p>
          <h1 className="page-title">安全性中心</h1>
          <p className="page-subtitle">
            從本機 Windows PowerShell 讀取 Defender、防火牆、帳戶、SmartScreen、TPM、Secure Boot、裝置健康與保護歷程。所有命令都由 Electron 主行程以固定參數執行。
          </p>
        </div>
        <div className="head-actions">
          <Button icon="RF" busy={loading} onClick={refresh}>重新整理</Button>
          <Button
            icon="WS"
            variant="primary"
            busy={action === 'openSecurity'}
            onClick={() => runAction('openSecurity', openWindowsSecurity, '已開啟 Windows 安全性')}
          >
            開啟 Windows 安全性
          </Button>
        </div>
      </div>

      {topErrors.length ? (
        <div className="security-error-panel">
          <strong>部分安全性資料無法讀取</strong>
          {topErrors.map((message) => <span key={message}>{message}</span>)}
        </div>
      ) : null}

      <div className="security-overview-strip">
        <div>
          <span className={`security-dot ${tones.defender}`} />
          <strong>Defender</strong>
          <em>{statusDescription(tones.defender)}</em>
        </div>
        <div>
          <span className={`security-dot ${tones.firewall}`} />
          <strong>Firewall</strong>
          <em>{statusDescription(tones.firewall)}</em>
        </div>
        <div>
          <span className={`security-dot ${overallTone}`} />
          <strong>整體狀態</strong>
          <em>{statusDescription(overallTone)}</em>
        </div>
        <div>
          <strong>最後更新</strong>
          <em>{state?.generatedAt ? formatDate(state.generatedAt) : '--'}</em>
        </div>
      </div>

      <div className="security-grid">
        <SecurityCard
          title="病毒與威脅防護"
          icon={icons.shield}
          status={tones.defender}
          description={statusDescription(tones.defender)}
          actions={(
            <>
              <Button size="sm" icon="SC" busy={action === 'quickScan'} onClick={() => runAction('quickScan', runQuickScan, '已啟動快速掃描')}>
                快速掃描
              </Button>
              <Button size="sm" icon="UP" busy={action === 'updateSignatures'} onClick={() => runAction('updateSignatures', updateSignatures, '已開始更新病毒碼')}>
                更新病毒碼
              </Button>
            </>
          )}
        >
          {detailRows([
            { label: 'AntivirusEnabled', value: boolText(defenderData.AntivirusEnabled) },
            { label: 'RealTimeProtectionEnabled', value: boolText(defenderData.RealTimeProtectionEnabled) },
            { label: 'AMServiceEnabled', value: boolText(defenderData.AMServiceEnabled) },
            { label: 'AntivirusSignatureLastUpdated', value: formatDate(defenderData.AntivirusSignatureLastUpdated) },
            { label: 'QuickScanAge', value: valueText(defenderData.QuickScanAge) },
            { label: 'FullScanAge', value: valueText(defenderData.FullScanAge) },
          ])}
        </SecurityCard>

        <SecurityCard
          title="防火牆與網路保護"
          icon={icons.firewall}
          status={tones.firewall}
          description={statusDescription(tones.firewall)}
          actions={(
            <Button size="sm" icon="FW" busy={action === 'openFirewall'} onClick={() => runAction('openFirewall', openFirewallSettings, '已開啟防火牆設定')}>
              開啟防火牆設定
            </Button>
          )}
        >
          {detailRows([
            { label: 'Domain profile enabled', value: boolText(domain?.Enabled) },
            { label: 'Private profile enabled', value: boolText(privateProfile?.Enabled) },
            { label: 'Public profile enabled', value: boolText(publicProfile?.Enabled) },
            { label: 'DefaultInboundAction', value: valueText(domain?.DefaultInboundAction || privateProfile?.DefaultInboundAction || publicProfile?.DefaultInboundAction) },
            { label: 'DefaultOutboundAction', value: valueText(domain?.DefaultOutboundAction || privateProfile?.DefaultOutboundAction || publicProfile?.DefaultOutboundAction) },
          ])}
        </SecurityCard>

        <SecurityCard
          title="帳戶防護"
          icon={icons.account}
          status={tones.account}
          description={statusDescription(tones.account)}
          actions={<Button size="sm" icon="WS" onClick={() => runAction('openAccount', openWindowsSecurity, '已開啟 Windows 安全性')}>開啟原生設定</Button>}
        >
          {detailRows([
            { label: 'Current user', value: valueText(accountData.UserName) },
            { label: 'Administrator', value: boolText(accountData.IsAdministrator) },
            { label: 'UAC enabled', value: boolText(accountData.UacEnabled) },
            { label: 'Passport service', value: valueText(accountData.PassportServiceStatus) },
            { label: 'Key isolation service', value: valueText(accountData.KeyIsolationServiceStatus) },
          ])}
        </SecurityCard>

        <SecurityCard
          title="應用程式與瀏覽器控制"
          icon={icons.browser}
          status={tones.appBrowser}
          description={statusDescription(tones.appBrowser)}
          actions={<Button size="sm" icon="WS" onClick={() => runAction('openAppBrowser', openWindowsSecurity, '已開啟 Windows 安全性')}>開啟原生設定</Button>}
        >
          {detailRows([
            { label: 'SmartScreen enabled', value: boolText(appData.SmartScreenEnabled) },
            { label: 'SmartScreen level', value: valueText(appData.SmartScreenLevel) },
            { label: 'Edge SmartScreen policy', value: boolText(appData.EdgeSmartScreenPolicy) },
            { label: 'PUA protection', value: boolText(appData.PUAProtection) },
            { label: 'Controlled folder access', value: boolText(appData.EnableControlledFolderAccess) },
            { label: 'Cloud block level', value: valueText(appData.CloudBlockLevel) },
          ])}
        </SecurityCard>

        <SecurityCard
          title="裝置安全性"
          icon={icons.device}
          status={tones.device}
          description={statusDescription(tones.device)}
          actions={<Button size="sm" icon="WS" onClick={() => runAction('openDevice', openWindowsSecurity, '已開啟 Windows 安全性')}>開啟原生設定</Button>}
        >
          {detailRows([
            { label: 'TPM present', value: boolText(deviceData.TpmPresent) },
            { label: 'TPM ready', value: boolText(deviceData.TpmReady) },
            { label: 'Secure Boot supported', value: boolText(deviceData.SecureBootSupported) },
            { label: 'Secure Boot enabled', value: boolText(deviceData.SecureBootEnabled) },
            { label: 'Memory integrity', value: boolText(deviceData.MemoryIntegrityEnabled) },
            { label: 'BitLocker protection', value: valueText(deviceData.BitLockerProtectionStatus) },
          ])}
        </SecurityCard>

        <SecurityCard
          title="裝置效能與運作狀況"
          icon={icons.health}
          status={tones.performance}
          description={statusDescription(tones.performance)}
        >
          {detailRows([
            { label: '作業系統', value: valueText(performanceData.OsCaption), wide: true },
            { label: '版本', value: valueText(performanceData.OsVersion) },
            { label: '上次開機', value: formatDate(performanceData.LastBootUpTime), wide: true },
            { label: '已開機天數', value: valueText(performanceData.UptimeDays) },
            { label: '系統碟可用空間', value: performanceData.SystemDriveFreePercent == null ? '--' : `${performanceData.SystemDriveFreePercent}% (${valueText(performanceData.SystemDriveFreeGB)} GB)`, wide: true },
            { label: '最後更新 KB', value: valueText(performanceData.LastHotFixId) },
          ])}
        </SecurityCard>

        <SecurityCard
          title="家長監護選項"
          icon={icons.family}
          status={tones.family}
          description={statusDescription(tones.family)}
          actions={<Button size="sm" icon="WS" onClick={() => runAction('openFamily', openWindowsSecurity, '已開啟 Windows 安全性')}>開啟原生設定</Button>}
        >
          {detailRows([
            { label: 'Parental controls service', value: valueText(familyData.ParentalControlsServiceStatus) },
            { label: 'Service start type', value: valueText(familyData.ParentalControlsServiceStartType) },
            { label: 'Local accounts', value: valueText(familyData.LocalAccountCount) },
            { label: 'Enabled local accounts', value: valueText(familyData.EnabledLocalAccountCount) },
            { label: 'Password required accounts', value: valueText(familyData.PasswordRequiredAccountCount) },
            { label: 'Locked out accounts', value: valueText(familyData.LockedOutAccountCount) },
          ])}
        </SecurityCard>

        <SecurityCard
          title="保護歷程記錄"
          icon={icons.history}
          status={tones.history}
          description={statusDescription(tones.history)}
          actions={<Button size="sm" icon="WS" onClick={() => runAction('openHistory', openWindowsSecurity, '已開啟 Windows 安全性')}>開啟原生設定</Button>}
        >
          {detailRows([
            { label: 'Threat count', value: valueText(historyData.ThreatCount) },
            { label: 'Active threats', value: valueText(historyData.ActiveThreatCount) },
            { label: 'Recent detections', value: valueText(historyData.RecentDetectionCount) },
            {
              label: 'Latest detection',
              value: historyData.RecentDetections
                ? valueText((Array.isArray(historyData.RecentDetections) ? historyData.RecentDetections[0] : historyData.RecentDetections)?.ThreatName)
                : '--',
            },
          ])}
        </SecurityCard>
      </div>
    </div>
  );
}
