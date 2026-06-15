# PC Life Assistant

> PC Life Assistant 是一個專為學生與工程師設計的 Windows 桌面助理，整合工作模式啟動、檔案整理、系統健康監控與 Git / 備份提醒，幫助使用者管理日常電腦工作流。

一個用 **Electron + React + Vite + Node.js（JavaScript，無 TypeScript）** 製作的 Windows 桌面工具。
它不是 Todo List，而是「學生 / 工程師工作流自動化工具」。

---

## ✨ 功能（MVP）

| 功能 | 說明 |
| --- | --- |
| 📊 **Dashboard** | PC Health Score、CPU / RAM / 磁碟、Downloads 未分類數量、Git 提醒、快捷按鈕 |
| 🚀 **一鍵工作模式** | 依設定檔開啟 VS Code、專案資料夾、網址（localhost / GitHub），並執行指令（如 `npm run dev`） |
| 🗂️ **Downloads 自動整理** | 依副檔名分類，**先預覽再移動**，重名自動加編號，**絕不刪除檔案** |
| ❤️ **PC 健康監控** | CPU / RAM / 磁碟 / 開機時間 + PC Health Score（100 分起算扣分制） |
| 🔧 **Git / 備份提醒** | 檢查專案是否為 git repo、未 commit 檔案數、距上次 commit 時間（只提醒，不自動 commit / push） |
| 🟦 **System Tray 常駐** | 關閉視窗會縮小到右下角系統匣，右鍵選單可快速操作 |
| 📁 **Project Hub**（v1.1） | 集中管理 config 內的專案，一鍵開啟資料夾 / VS Code / Terminal / `npm run dev` / Git status |
| ⌨️ **Command Palette**（v1.1） | 全域快捷鍵 **Ctrl+Shift+P**，搜尋並執行指令（導航、開啟專案、跑 npm run dev、啟動模式） |
| 🔔 **Smart Rules**（v1.1） | JSON 規則：Downloads 數量 / RAM% / 專案太久沒 commit / Disk 剩餘空間，達門檻時提醒（只提醒，不自動執行危險操作） |
| 🖼️ **Screenshot Organizer**（v1.1） | 依檔名關鍵字將截圖分類到 Code / Circuit / Report / School / Other，先預覽再移動、不刪除、重名加編號 |

### PC Health Score 計分規則

```
100 分起算
RAM 使用率超過 80%           → -10
磁碟剩餘空間低於 20%          → -15
CPU 長時間（連續取樣）超過 80% → -10
Downloads 未分類檔案超過 50 個 → -5
有專案超過 24 小時沒 commit    → -10
```

---

## 🧰 技術棧

- **Electron 33**（桌面殼層 + 系統匣）
- **React 18 + Vite 6**（前端 UI）
- **Node.js**（`os`、`fs`、`child_process`）
- 設定檔使用 **JSON**（第一版不使用資料庫 / 外部 API / 登入 / 雲端同步）

---

## 📁 專案架構

```
pc-life-assistant/
├─ electron/
│  ├─ main.js                  # Electron 主程序、視窗、系統匣、IPC 註冊
│  ├─ preload.js               # 安全的 IPC bridge（window.api）
│  ├─ assets/tray-icon.png     # 系統匣圖示（由 npm run gen:icons 產生）
│  └─ services/
│     ├─ settingsService.js    # 讀寫 JSON 設定檔
│     ├─ systemMonitorService.js
│     ├─ fileOrganizerService.js
│     ├─ gitService.js
│     ├─ modeService.js
│     ├─ projectService.js     # v1.1 Project Hub 動作
│     ├─ commandService.js     # v1.1 Command Palette action registry
│     ├─ ruleService.js        # v1.1 Smart Rules 評估
│     └─ screenshotService.js  # v1.1 截圖分類掃描
├─ src/
│  ├─ main.jsx / App.jsx
│  ├─ pages/                   # Dashboard / Projects / Modes / FileOrganizer / Screenshots / Rules / HealthMonitor / Settings
│  ├─ components/              # Layout / StatusCard / ActionButton / AlertList / CommandPalette
│  ├─ utils/format.js
│  └─ styles/global.css
├─ config/
│  └─ user-settings.json       # 預設設定檔
├─ scripts/generate-icons.js   # 產生 icon（無外部依賴）
├─ build/icon.png              # 打包用 App 圖示（由 npm run gen:icons 產生）
├─ vite.config.mjs
├─ package.json
└─ README.md
```

> 圖示 `build/icon.png` 與 `electron/assets/tray-icon.png` 是程式自動產生的佔位圖，可隨時替換成自己的圖。

---

## 🚀 安裝

需要 **Node.js 18+**（建議 20/22）。

```bash
npm install
```

---

## 💻 開發模式（npm run dev）

開發時用這個指令，會**同時**啟動 Vite dev server 與 Electron，並支援前端熱更新：

```bash
npm run dev
```

它會：
1. 啟動 Vite（綁定 `127.0.0.1:5173`，**不會自動打開瀏覽器**）。
2. 等 Vite 起來後（`wait-on`）以 `NODE_ENV=development` 啟動 **Electron**。
3. Electron 視窗載入 `http://localhost:5173`；打包後（production）則改載入 `dist/index.html`。

> ⚠️ **`http://localhost:5173` 只是 Electron 內部開發用的網址，不是給瀏覽器用的。**
> 請使用自動跳出的 **Electron 桌面視窗** 操作，不要用 Edge / Chrome 開這個網址 —
> 在一般瀏覽器裡開會看到「無法連接 Electron 主程序」，因為瀏覽器沒有 Electron 的
> preload bridge（`window.api`），自然無法呼叫系統功能。
>
> 開發模式下會直接讀寫 `config/user-settings.json`。

---

## 📦 正式使用 / 打包成 Windows 安裝檔

正式使用 **不需要** 再開 VS Code 或執行 `npm run dev`。
打包後使用者只要安裝並點開 `PC Life Assistant`（捷徑 / 開始選單）即可。

```bash
# 產生圖示 + 建置前端 + 用 electron-builder 打包成 .exe / Setup.exe
npm run package
```

- 輸出位置：`release/`
  - `PC Life Assistant Setup x.y.z.exe`：安裝程式（NSIS，可選安裝路徑、建立桌面捷徑）
  - 安裝後即為一般 Windows App，雙擊即可使用。
- 只想快速產生免安裝資料夾版（測試用）：

```bash
npm run package:dir   # 輸出到 release/win-unpacked/
```

> ⚠️ **打包請在 Windows 上執行**（electron-builder 產生 Windows 安裝檔需要 Windows 環境）。
> 在 macOS / Linux 上 `npm run dev` 與大部分功能仍可運作，但磁碟 / 路徑預設值會以該作業系統為準。

打包後設定檔會被複製到使用者可寫入的位置：
`%APPDATA%\PC Life Assistant\user-settings.json`（在「設定」頁可看到實際路徑，並有「用系統開啟」按鈕）。

---

## ⌨️ Command Palette（Ctrl+Shift+P）

按 **Ctrl+Shift+P**（全域快捷鍵，App 在背景時也有效）即可開啟快速指令面板：

- 用 ↑ ↓ 選擇、Enter 執行、Esc 關閉。
- 內建：開啟各頁面、用 VS Code 開啟某專案、執行某專案的 `npm run dev`、啟動工作模式。
- 指令清單由 `electron/services/commandService.js`（action registry）統一管理，會依 `config` 的 projects / modes 動態產生。

---

## ⚙️ 設定（user-settings.json）

可在 App 內「設定」頁直接編輯並儲存，或手動編輯檔案。**Windows 路徑請使用雙反斜線**。

```json
{
  "general": {
    "downloadsPath": "",
    "monitorDrives": ["C:\\", "D:\\"]
  },
  "modes": [
    {
      "name": "寫程式模式",
      "apps": ["C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"],
      "folders": ["D:\\Projects\\codex"],
      "urls": ["http://localhost:5173", "https://github.com/jeremywu0420/codex"],
      "commands": [{ "cwd": "D:\\Projects\\codex", "command": "npm run dev" }]
    }
  ],
  "projects": [
    {
      "name": "codex",
      "path": "D:\\Projects\\codex",
      "gitReminderHours": 2,
      "backupReminderHours": 24
    }
  ]
}
```

可修改的位置：

- `general.downloadsPath`：自訂 Downloads 路徑（留空 → 使用者家目錄下的 `Downloads`）。
- `general.monitorDrives`：要監控的多顆磁碟，例如 `["C:\\", "D:\\"]`；設成空陣列 `[]` 會自動偵測所有可用磁碟。仍相容舊版單一字串 `monitorDrive`（只有在沒有 `monitorDrives` 時才使用）。任一顆磁碟剩餘空間 < 20% 都會扣 Health Score 並在提醒中標明是哪一顆。
- `modes[]`：每個工作模式的 `apps` / `folders` / `urls` / `commands`。
- `projects[]`：要追蹤 Git 的專案與提醒時數（也是 Project Hub 與 Command Palette 的來源）。
- `rules[]`（v1.1）：Smart Rules，每條含 `type`（`downloadsCount` / `ramUsage` / `projectStale` / `diskFree`）、`threshold`、`level`、`enabled`。可在「Smart Rules」頁面用 UI 調整。
- `screenshots.path`（v1.1）：截圖資料夾（留空 → `~/Pictures/Screenshots`）。
- `screenshots.keywords`（v1.1）：自訂分類關鍵字，例如 `{ "Circuit": ["pcb", "電路"] }`（會與內建關鍵字合併）。

> 預設值請依你的電腦調整路徑（例如 VS Code 安裝路徑、專案位置）。

---

## 🟦 System Tray 行為

- App 啟動後常駐右下角系統匣。
- **關閉視窗不會結束程式**，而是縮小到系統匣（要完全離開請用右鍵選單的「離開」）。
- 左鍵點擊 tray icon → 開啟 Dashboard。
- 右鍵 tray icon 選單：
  - 開啟 PC Life Assistant
  - 寫程式模式（直接啟動第一個模式）
  - 整理 Downloads（開啟整理頁，先預覽）
  - 檢查 Git（開啟健康監控頁）
  - 離開

---

## 🧪 第一版測試流程

1. `npm install` → `npm run dev`，確認視窗開啟、Dashboard 顯示 CPU/RAM/磁碟數字。
2. **健康監控**：靜置幾秒觀察 CPU 數字更新；Health Score 與扣分項目正常顯示。
3. **整理 Downloads**：
   - 在 Downloads 放幾個測試檔（`.pdf`、`.png`、`.cpp`、未知副檔名）。
   - 按「掃描」→ 確認 preview 分類正確、**檔案尚未移動**。
   - 按「確認並整理」→ 檔案被移到對應子資料夾；放兩個同名檔測試 `file(1).ext` 編號。
   - 對不存在的路徑（設定一個錯誤 `downloadsPath`）應顯示友善錯誤、不崩潰。
4. **工作模式**：設定一個指向真實 VS Code / 資料夾 / 網址的模式，按「啟動」，檢查執行結果表格（成功 / 失敗訊息）。把某個路徑改成不存在 → 應顯示錯誤但其他步驟仍執行。
5. **Git 提醒**：把 `projects[].path` 指向一個真的 git repo，修改其中檔案，重新整理 → 顯示未 commit 數量與提醒。
6. **Tray**：關閉視窗 → 程式縮到系統匣；右鍵選單各項目可用；「離開」才真正結束。
7. `npm run package`（在 Windows）→ 安裝產生的 Setup.exe → 不開 VS Code 直接執行 App。

---

## 🔭 後續可以加的功能

- [ ] 更多內建模式（報告模式、清理模式）與模式編輯 UI（不必手改 JSON）
- [ ] 桌面通知（Health Score 過低 / 太久沒 commit 主動提醒）
- [ ] 開機自動啟動（`app.setLoginItemSettings`）
- [ ] 整理規則自訂 UI（自訂分類與副檔名對應）
- [ ] 整理「復原」功能（記錄上次移動，可一鍵還原）
- [ ] CPU / RAM 歷史折線圖
- [ ] GPU 溫度 / 風扇（需額外整合，如 LibreHardwareMonitor）
- [ ] 一鍵 `git commit` / `git push`（含確認）
- [ ] 多磁碟同時監控
- [ ] 深色 / 淺色主題切換、i18n
- [ ] 設定備份 / 匯入匯出

---

## 🔒 安全與穩定性原則

- 不刪除使用者檔案；移動前一定先 preview，使用者確認後才動。
- 不要求系統管理員權限。
- 所有檔案操作都有 `try/catch`，路徑不存在時顯示友善錯誤，不讓程式崩潰。
- 重名檔案自動加編號，不覆蓋。
- Git 服務為唯讀（只 `git status` / `git log`），不自動 commit / push。
- 各服務分離（single responsibility），IPC 通道清楚命名（`<domain>:<action>`）。

---

## 📜 License

MIT
