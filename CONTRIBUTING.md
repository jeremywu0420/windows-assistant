# Contributing

Thanks for working on PC Life Assistant. This guide covers local setup, the
quality gates, and the common patterns you'll need.

## Setup

```bash
npm install
npm run dev        # Vite renderer + Electron, hot-reloaded
```

Requirements: Node.js 20+ (CI runs 20 & 22), Windows 10/11 for the full feature
set (many services call Windows-only tooling). The renderer and unit tests run
on any OS.

## Quality gates

Run these before pushing — CI runs the same set and will fail the PR otherwise:

```bash
npm run lint        # ESLint (bug-focused; Prettier owns formatting)
npm run typecheck   # tsc --noEmit (strict)
npm run test        # Vitest unit tests
npm run build       # Vite renderer build
npm run format      # Prettier --write (or format:check to verify)
```

`npm run test:coverage` produces a coverage report under `coverage/`.

## Project layout

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the process model and directory
map. The one-line version: **main process** (`electron/`, CommonJS) talks to the
**renderer** (`src/`, React/ESM) only through the **preload bridge**
(`window.api`).

## Adding a backend capability

A renderer feature that needs Node/OS access touches three files:

1. **Service** — add the logic in `electron/services/<name>Service.js`, exported
   from `module.exports`. Keep it pure/Node-testable where possible (services
   already avoid hard Electron coupling so they can be unit-tested).
2. **IPC handler** — register it in `electron/main.js`:
   ```js
   ipcMain.handle('domain:action', async (_event, payload) => {
     return someService.doThing(payload);
   });
   ```
3. **Bridge** — expose it in `electron/preload.js`:
   ```js
   doThing: (payload) => ipcRenderer.invoke('domain:action', payload),
   ```

Then call `window.api.doThing(...)` from the renderer. Validate untrusted
payloads in the handler before touching the filesystem.

## Adding a workflow node type

The visual editor and the engine share a vocabulary — update both:

1. Add the action handler (a `case`) in `automationService.runAction`, or the
   predicate in `automationService.matches` for a new trigger/condition.
2. Add the node definition to `src/components/workflow/nodeCatalog.ts`
   (`TRIGGER_TYPES` / `CONDITION_TYPES` / `ACTION_TYPES`), with bilingual labels
   and any property `fields`. Mark file-mutating actions `destructive: true`.
3. If it mutates files, add the action type to `DESTRUCTIVE_ACTIONS` in
   `electron/services/workflowService.js`. The `nodeCatalog` contract test will
   fail if the catalog and engine disagree — that's intentional.

## Tests

- **Unit (Vitest)** — co-locate `*.test.js`/`*.test.ts` next to the module.
  Import the real module; for services that pull `electron`, the configured
  alias swaps in `test/stubs/electron.js` automatically. Prefer testing pure
  logic (utils, engine traversal, predicates) over UI.
- **E2E (Playwright)** — `npm run test:e2e` drives the built renderer with a
  mocked `window.api` (see `e2e/`). Use it for cross-component flows like the
  workflow editor happy path.

## Style & conventions

- Prettier is authoritative for formatting (`.prettierrc`): single quotes,
  trailing commas, 100-col. Don't hand-format; run `npm run format`.
- ESLint targets real bugs, not style. Fix warnings in code you touch.
- New renderer modules: prefer TypeScript (`.ts`/`.tsx`) and keep them passing
  `strict`. Legacy `.jsx` can stay as-is.
- i18n: every user-facing string goes through `useLocale().t(key)` with an entry
  in both `en` and `zh` in `src/i18n.jsx` (or a bilingual data module like
  `nodeCatalog.ts`).

## Commits & PRs

- Use conventional-commit-style prefixes (`feat:`, `fix:`, `refactor:`,
  `test:`, `docs:`, `perf:`, `chore:`). Keep commits focused — a mechanical
  reformat shouldn't ride along with a behavior change.
- Make sure the full gate is green locally before opening a PR.
