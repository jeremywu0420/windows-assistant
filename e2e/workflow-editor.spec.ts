import { test, expect, type Page } from '@playwright/test';

/**
 * Drives the flagship visual workflow editor end-to-end against the built
 * renderer. `window.api` (the Electron preload bridge) is mocked before the app
 * boots, so this validates the real React flow — navigation, creating a
 * workflow, applying a template, and previewing a dry-run — independently of the
 * Electron/Windows backend (the engine itself is covered by unit tests).
 */

// Injected before any app script runs. A permissive Proxy answers unknown calls
// with { ok: true }; the methods the app actually depends on are pinned.
async function mockApi(page: Page) {
  await page.addInitScript(() => {
    const noopUnsub = () => () => {};
    const overrides: Record<string, unknown> = {
      // App boot
      onNavigate: noopUnsub,
      onModeResult: noopUnsub,
      onOpenCommandPalette: noopUnsub,
      onFileEvent: noopUnsub,
      onAutomationFired: noopUnsub,
      getSetupStatus: async () => ({ ok: true, complete: true }),
      getSettings: async () => ({ ok: true, settings: { general: { language: 'en' } } }),
      getDashboardStats: async () => ({ ok: true, stats: {}, nodes: [] }),
      getSystemStatus: async () => ({ ok: true }),
      // Workflow editor
      workflows: {
        list: async () => ({ ok: true, workflows: [] }),
        save: async () => ({ ok: true }),
        setEnabled: async () => ({ ok: true }),
        dryRun: async () => ({
          ok: true,
          dryRun: true,
          steps: [{ nodeId: 'a1', type: 'organizeFileByType', destructive: true, dryRun: true }],
        }),
        run: async () => ({
          ok: true,
          steps: [{ nodeId: 'a1', type: 'organizeFileByType', ok: true }],
        }),
      },
    };

    const handler: ProxyHandler<Record<string, unknown>> = {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        // Unknown member: a callable that resolves ok and proxies deeper access.
        const fn = () => Promise.resolve({ ok: true });
        return new Proxy(fn, handler as ProxyHandler<typeof fn>);
      },
    };
    (window as unknown as { api: unknown }).api = new Proxy(overrides, handler);
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
});

test('navigates to the visual automation editor', async ({ page }) => {
  await page.getByText('Workflows', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visual Automation' })).toBeVisible();
});

test('create a workflow, apply a template, and preview a dry-run', async ({ page }) => {
  await page.getByText('Workflows', { exact: true }).click();

  // New workflow (the + in the list header), then apply a starter template.
  await page.locator('.wf-list-head button').click();
  await expect(page.locator('.wf-list-item')).toHaveCount(1);

  await page.getByRole('button', { name: 'Tidy Downloads' }).click();
  // The template lays down a trigger and an action node on the canvas.
  await expect(page.locator('.wf-node')).toHaveCount(2);
  await expect(page.locator('.wf-node-danger')).toHaveCount(1); // organize = destructive

  // Dry-run previews the plan without executing.
  await page.getByRole('button', { name: 'Dry run' }).click();
  const output = page.locator('.wf-output');
  await expect(output).toContainText('Dry run');
  await expect(output).toContainText('Organize file');
});

test('add a trigger node from the toolbar', async ({ page }) => {
  await page.getByText('Workflows', { exact: true }).click();
  await page.locator('.wf-list-head button').click();
  await page.getByRole('button', { name: '+ Trigger' }).click();
  await expect(page.locator('.wf-node-trigger')).toHaveCount(1);
});
