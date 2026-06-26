function unavailable(error: string) {
  return {
    ok: false,
    code: 'IPC_UNAVAILABLE',
    error,
    generatedAt: new Date().toISOString(),
  };
}

export async function getSecurityStatus() {
  if (!window.api?.security?.getStatus) {
    return unavailable(
      'Security Center IPC is unavailable. Start the Electron app to read Windows security data.',
    );
  }
  return window.api.security.getStatus();
}

export async function runQuickScan() {
  if (!window.api?.security?.quickScan) {
    return unavailable('Security Center IPC is unavailable.');
  }
  return window.api.security.quickScan();
}

export async function updateSignatures() {
  if (!window.api?.security?.updateSignatures) {
    return unavailable('Security Center IPC is unavailable.');
  }
  return window.api.security.updateSignatures();
}

export async function openWindowsSecurity() {
  if (!window.api?.security?.openWindowsSecurity) {
    return unavailable('Security Center IPC is unavailable.');
  }
  return window.api.security.openWindowsSecurity();
}

export async function openFirewallSettings() {
  if (!window.api?.security?.openFirewallSettings) {
    return unavailable('Security Center IPC is unavailable.');
  }
  return window.api.security.openFirewallSettings();
}
