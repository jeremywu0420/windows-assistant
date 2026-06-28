# Architecture

PC Life Assistant (in-app brand **NEXUS**) is an Electron desktop app. This
document explains how the pieces fit together so a new contributor can navigate
the codebase quickly.

## Process model

Electron runs three kinds of code; keeping them separate is the central design
constraint.

```
┌──────────────────────────────────────────────────────────────────┐
│ Main process  (Node.js, CommonJS)            electron/main.js      │
│  • windows, tray, global shortcuts, power events                   │
│  • registers every ipcMain.handle('domain:action', …)              │
│  • owns the service layer  →  electron/services/*.js                │
└───────────────▲───────────────────────────────┬───────────────────┘
                │  ipcRenderer.invoke            │  webContents.send
                │  (request / response)          │  (push events)
┌───────────────┴───────────────────────────────▼───────────────────┐
│ Preload  (electron/preload.js)                                     │
│  • the ONLY bridge: contextBridge.exposeInMainWorld('api', { … })  │
│  • renderer never touches Node/Electron directly                   │
└───────────────▲────────────────────────────────────────────────────┘
                │  window.api.*
┌───────────────┴────────────────────────────────────────────────────┐
│ Renderer  (React 18 + Vite, ESM)             src/**                  │
│  • pages (src/pages), components, hooks, i18n, theme                 │
│  • talks to the backend exclusively through window.api               │
└─────────────────────────────────────────────────────────────────────┘
```

**Why it matters:** the renderer is sandboxed. If a page needs a new backend
capability you add it in three places — a service function, an `ipcMain.handle`
in `main.js`, and a method on `window.api` in `preload.js`. See
[CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-backend-capability).

## Languages

- **Main process & services**: plain JavaScript (CommonJS). It is _not_ bundled
  — Electron loads it directly — so keep it `require`-based.
- **Renderer**: JavaScript/JSX, with TypeScript adopted incrementally
  (`tsconfig.json` is `allowJs` + `strict`). New renderer modules should be
  `.ts`/`.tsx`; the workflow editor (`src/pages/WorkflowEditor.tsx` and
  `src/components/workflow/*`) is the reference for strict-typed new code.

## Directory map

| Path                        | Responsibility                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `electron/main.js`          | App lifecycle, windows, tray, IPC handler registration                                             |
| `electron/preload.js`       | Secure `window.api` bridge                                                                         |
| `electron/services/`        | One module per capability (cleanup, projects, automations, workflows, system monitor, security, …) |
| `electron/services/shared/` | Constants shared across services (e.g. `PROJECT_EXCLUDES`)                                         |
| `electron/types.d.ts`       | Shared domain types consumed by the strict TS surface                                              |
| `src/pages/`                | One component per screen; routed by `src/App.jsx`                                                  |
| `src/components/`           | Reusable UI (Dialog, Toast, Button, workflow nodes, …)                                             |
| `src/hooks/`                | Reusable hooks (e.g. `usePollingEffect`)                                                           |
| `src/utils/`                | Pure helpers (format, eeMath, projectSort)                                                         |
| `src/i18n.jsx`              | Bilingual (en / zh-Hant) string resources + `useLocale`                                            |
| `src/styles/`               | Global + per-feature CSS, theme tokens in `tokens.css`                                             |

## Settings & persistence

There is no database. All state lives in a single JSON file —
`config/user-settings.json` in dev, `%APPDATA%/PC Life Assistant/user-settings.json`
when packaged. `electron/services/settingsService.js` owns load/save, deep-merges
user values over defaults (`mergeSettings`), and recovers from a corrupt file by
backing it up and rewriting defaults. A sanitized `user-settings.example.json` is
committed; the real file is git-ignored.

## The workflow engine (flagship feature)

The visual automation editor is an _upgrade_ of the older flat
condition→action automations, not a parallel system.

- **Model**: a workflow is a directed graph — `{ id, name, enabled, nodes[],
edges[] }`. Nodes are `trigger` | `condition` | `action`.
- **Engine** (`electron/services/workflowService.js`): `runWorkflow` walks the
  graph from each firing trigger; `condition` nodes prune branches; `action`
  nodes execute. It deliberately **reuses** `automationService.matches()` (the
  predicate) and `automationService.runAction()` (the side effects), so the
  visual layer and the legacy rules share one execution path.
- **Safety**: file-mutating actions are flagged `destructive`; the renderer
  gates them behind a confirm dialog, and `dryRun` walks the same graph while
  executing nothing.
- **Backward compatibility**: `listWorkflows` transparently migrates legacy flat
  `automations` into two-node graphs, so no existing rule is lost.
- **Triggers**: file events (`onNewFile` in `main.js`), a minute-cadence
  schedule tick (reusing `automationService.scheduleDueFor` for timing/dedupe),
  and manual "Run".
- **UI**: `src/pages/WorkflowEditor.tsx` (React Flow / `@xyflow/react`) with the
  node catalog in `src/components/workflow/nodeCatalog.ts` as the single source
  of node types — the same vocabulary the legacy `Automations.jsx` list uses.

## Observability

`electron/services/loggerService.js` writes one JSON line per entry to
`<userData>/logs/app.log` and keeps an in-memory ring buffer of recent entries.
It is local-only and can be disabled via `general.diagnostics === false`.
`main.js`'s `writeLog(level, message)` routes through it.

## Quality gates

`lint` → `typecheck` → `test` → `build` run locally and in CI
(`.github/workflows/ci.yml`, Node 20 & 22). Unit tests (Vitest) focus on pure
logic and services; an Electron stub (`test/stubs/electron.js`) keeps service
tests hermetic. See [CONTRIBUTING.md](./CONTRIBUTING.md).
