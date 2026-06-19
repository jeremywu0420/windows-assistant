# PC Life Assistant

PC Life Assistant is a Windows desktop assistant built for students, engineers, and makers who manage many projects, files, screenshots, tools, and local development workflows.

It combines a daily workspace dashboard, project launcher, file organizer, system health monitor, automation rules, and safe cleanup tools into one Electron app. The goal is not to replace a task manager or an IDE, but to reduce the small repeated steps around everyday computer work.

## Current Version

- App version: `2.2.0`
- Platform focus: Windows desktop
- Runtime: Electron + React + Vite + Node.js
- Language: JavaScript
- License: MIT

## Key Features

| Area | What it does |
| --- | --- |
| Daily Dashboard | Shows health score, CPU, RAM, disk status, pinned projects, Git reminders, and recent activity. |
| Project Hub | Scans selected project roots, classifies projects, filters by type/status, pins projects, and creates work modes from selected projects. |
| Work Modes | Opens apps, folders, URLs, and shell commands as a repeatable workspace. Useful for coding, study, design, reports, or hardware work. |
| Workspace Templates | Creates starter project folders for common project types such as web, Python, JavaScript, C/C++, embedded, Arduino, FPGA, documents, and custom workspaces. |
| Clean Center | Reviews temporary files, caches, large files, duplicates, downloads, recycle bin size, and project-related cleanup suggestions. |
| Downloads Organizer | Scans downloads, previews planned moves, classifies files, avoids deletion, and handles duplicate filenames safely. |
| Screenshot Organizer | Groups screenshot images by date and category using configurable keyword rules. |
| System Monitor | Displays CPU, RAM, disk, uptime, GPU temperature when available, and hardware summary. |
| Health Guard | Monitors system health rules and produces actionable alerts for low disk space, high resource use, stale projects, and cleanup opportunities. |
| Automations | Supports safe scheduled reminders and helper actions for cleanup, screenshots, and project rescans. |
| Command Palette | Provides a global quick action interface for navigation, project actions, health checks, cleanup scans, and workspace commands. |
| Notifications | Centralizes local app notifications and activity history. |
| Setup Wizard | Guides first-time configuration for folders, screenshots, VS Code, project roots, and monitoring preferences. |

## Safety Principles

PC Life Assistant is designed around review-first workflows.

- File organization actions preview changes before moving files.
- Cleanup tools distinguish safe review items from destructive actions.
- Git features inspect repository status and reminders; they do not automatically commit or push.
- Project scanning only works within folders the user configures.
- Settings are stored locally for the desktop app.
- Build artifacts, dependency folders, logs, backups, and private configuration files should stay out of version control.

## Project Hub and Work Modes

Project Hub is the main workspace management area.

It can:

- scan configured roots with a depth limit;
- detect Git repositories and common project types;
- show file counts, last modified dates, and development command hints;
- filter projects by status, type, pinned state, and search text;
- pin projects to the daily dashboard;
- open a project folder, VS Code, terminal, dev command, or Git view;
- select multiple projects and create a new Work Mode from them.

When creating a Work Mode from selected projects, the app can add:

- a VS Code launch entry for each project;
- project folders;
- available development commands such as `npm run dev`;
- a generated mode name that can be edited before saving.

## Clean Center

Clean Center provides a structured review surface for cleanup work.

It focuses on:

- temporary files;
- app and browser caches where supported;
- downloads review;
- large file analysis;
- duplicate file candidates;
- recycle bin size;
- project cleanup suggestions;
- cleanup history and restore-aware workflows where available.

The app favors clear summaries and confirmation before action, so cleanup remains intentional.

## File and Screenshot Organization

Downloads Organizer and Screenshot Organizer are built for low-risk organization:

- scan first;
- show a preview;
- classify files by rules;
- move files only after confirmation;
- avoid overwriting existing files;
- record activity for review.

Screenshot organization supports date-based folders and category rules for common contexts such as code, reports, school work, circuits, and other image groups.

## System Health

The health system combines resource metrics and workflow signals.

It can consider:

- CPU usage;
- RAM usage;
- disk free space;
- uptime;
- downloads backlog;
- stale Git work;
- cleanup recommendations;
- hardware readings when available.

The dashboard turns these signals into a health score, cards, alerts, and suggested actions.

## Architecture

```text
pc-life-assistant/
  electron/
    main.js                 Electron main process and IPC handlers
    preload.js              Safe renderer bridge
    services/               Local system, project, cleanup, settings, and automation services
  src/
    App.jsx                 App routing and layout composition
    main.jsx                React entry point
    components/             Reusable UI components
    layout/                 App shell, sidebar, and topbar
    pages/                  Main app screens
    styles/                 Global styles and theme variables
    theme/                  Theme provider
    utils/                  Formatting and helper utilities
  config/
    user-settings.json      Default local app settings template
  scripts/
    clean-dist.js           Build cleanup helper
    generate-icons.js       Icon generation helper
  package.json
  vite.config.mjs
```

## Main Screens

| Screen | Purpose |
| --- | --- |
| Dashboard | Daily status, quick actions, pinned projects, and health overview. |
| Project Hub | Project scanning, search, filters, Git state, pinning, and work mode creation. |
| Work Modes | Create, edit, duplicate, and launch repeatable workspaces. |
| Workspace Templates | Generate starter folder structures for common project types. |
| File Organizer | Preview and organize downloads or selected folders. |
| Screenshots | Scan and organize screenshot images by date and category. |
| Clean Center | Review cleanup candidates and safe maintenance suggestions. |
| Automations | Configure scheduled reminders and safe helper actions. |
| System Monitor | Inspect live hardware and resource status. |
| Health Monitor | Review health checks, recommendations, and guard settings. |
| Notification Center | Review app notifications and related actions. |
| Activity History | Review recent organize, cleanup, and notification activity. |
| Settings | Manage paths, appearance, health guard, cleanup behavior, and app preferences. |
| Setup Wizard | Guided first-run setup for important folders and tools. |

## Requirements

- Windows 10 or later is recommended.
- Node.js 18 or later.
- npm.
- VS Code is optional but recommended for project launching features.

## Development

Install dependencies:

```bash
npm install
```

Run the desktop app in development mode:

```bash
npm run dev
```

Build the renderer:

```bash
npm run build
```

Create a Windows installer:

```bash
npm run package
```

Create an unpacked build for local inspection:

```bash
npm run package:dir
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Starts Vite and Electron for local development. |
| `npm run dev:vite` | Starts only the Vite dev server. |
| `npm run dev:electron` | Starts only Electron after the renderer is available. |
| `npm run build` | Builds the React renderer. |
| `npm run preview` | Previews the built renderer. |
| `npm run gen:icons` | Generates app icon assets. |
| `npm run package` | Builds and packages the Windows installer. |
| `npm run package:dir` | Builds an unpacked Windows app directory. |
| `npm run release:github` | Builds and publishes a release through the configured release provider. |

## Configuration

The app uses a local JSON settings file for preferences such as:

- monitored folders;
- project roots;
- work modes;
- screenshot organization rules;
- cleanup behavior;
- theme and compact mode;
- notification preferences;
- automation rules.

Do not commit private local configuration or generated build output. Keep repository commits limited to source code, templates, documentation, and safe example data.

## Privacy and Local Data

PC Life Assistant is a local desktop utility. Its core features are designed to operate on local folders and local system information selected or configured by the user.

Public documentation and commits should not include:

- personal machine paths;
- private project names;
- credentials;
- sensitive private values;
- private service endpoints;
- generated installers or unpacked builds;
- dependency folders;
- logs or backup folders.

## Development Notes

- Electron main-process services are grouped by domain under `electron/services`.
- Renderer pages live under `src/pages`.
- Shared UI elements live under `src/components`.
- Work mode launching is handled by the mode service.
- Project detection, templates, and Project Hub actions are handled by the project service.
- Cleanup, downloads, and screenshot organization are implemented as review-first workflows.
- Global command palette actions are composed from local UI commands and backend-generated project/mode commands.

## Roadmap Ideas

- More built-in workspace templates.
- Richer health score history charts.
- More project language detectors.
- Improved restore history for all file operations.
- More automation triggers with explicit review controls.
- Optional export/import for settings.
- More detailed release notes and update flow.

## License

MIT
