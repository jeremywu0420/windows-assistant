export async function getDashboardStats() {
  if (!window.api?.getDashboardStats) {
    return {
      ok: false,
      error: 'Dashboard IPC is unavailable. Start the Electron app to load live system data.',
    };
  }
  return window.api.getDashboardStats();
}
