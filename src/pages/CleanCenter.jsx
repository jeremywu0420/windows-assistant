import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import DataTable from '../components/DataTable.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

const RISK_SAFE = '安全清理';
const RISK_REVIEW = '建議確認';
const RISK_AVOID = '不建議自動清理';
const RISK_PERMANENT = '永久刪除';

const categoryInfo = {
  'Windows Temp': {
    title: 'Windows Temp',
    what: 'Windows 與系統服務產生的暫存檔，通常位於 Windows Temp。',
    after: '清理後檔案會移到資源回收筒；系統或程式需要時會重新建立暫存檔。',
    risk: '如果 Windows 正在更新、安裝驅動或執行安裝程式，清理過新的暫存檔可能讓任務失敗。',
    recommendation: '建議只清理最後修改超過 7 天的項目；最近 24 小時內的檔案不會預設勾選。',
  },
  'User Temp': {
    title: 'User Temp',
    what: '目前使用者帳號下的 App 暫存檔，常見於 AppData Local Temp。',
    after: '多數 App 會自動重新建立需要的暫存檔，下次開啟可能稍慢。',
    risk: '若 App 正在下載、編譯、安裝或轉檔，刪除使用中的暫存檔可能造成該工作失敗。',
    recommendation: '建議只清理 7 天以上的項目，並避開 Downloads、Desktop、Documents。',
  },
  'Browser Cache': {
    title: 'Browser Cache',
    what: 'Chrome / Edge 等瀏覽器儲存的網站快取、Code Cache 與 GPU Cache。',
    after: '網站資源會重新下載，初次開啟可能稍慢；不會刪除書籤、密碼或瀏覽紀錄。',
    risk: '瀏覽器正在執行時部分檔案可能被鎖定，系統會跳過無法清理的項目。',
    recommendation: '通常可以清理，但如果正在進行重要網頁工作，建議先關閉瀏覽器。',
  },
  'Thumbnail Cache': {
    title: 'Thumbnail Cache',
    what: 'Windows 檔案總管產生的圖片、影片縮圖快取。',
    after: '資料夾縮圖會重新產生，第一次開啟圖片或影片資料夾時可能變慢。',
    risk: '不會刪除原始圖片或影片，但可能讓縮圖短時間消失。',
    recommendation: '縮圖顯示異常或佔用空間較大時再清理。',
  },
  'Log / Dump': {
    title: 'Log / Dump',
    what: '程式紀錄、錯誤 dump、暫存備份檔。',
    after: '清理後會少掉除錯與追查錯誤用的紀錄。',
    risk: '如果近期有程式閃退或正在排查問題，刪除紀錄可能讓問題更難追蹤。',
    recommendation: '建議確認後清理，最近的 log/dump 可先保留。',
  },
  'Large Files': {
    title: 'Large Files',
    what: '在掃描根目錄中找到的大型檔案，可能是影片、壓縮檔、安裝包或專案素材。',
    after: '刪除後可釋放大量空間，但這通常是使用者資料。',
    risk: '可能刪到重要素材、備份或專案產物，不建議自動清理。',
    recommendation: '只作為提醒清單，請人工確認內容後再處理。',
  },
  'Duplicate Files': {
    title: 'Duplicate Files',
    what: '大小與內容雜湊相同的檔案群組。',
    after: '移除重複副本可節省空間。',
    risk: '重複檔仍可能是專案、備份或不同資料夾流程需要的副本。',
    recommendation: '建議逐筆確認，不要一次全部清理。',
  },
  'Recycle Bin': {
    title: 'Recycle Bin',
    what: 'Windows 資源回收筒內已刪除但尚未永久移除的檔案。',
    after: '清空後通常無法再從原位置還原。',
    risk: '這是永久刪除行為，復原成本高。',
    recommendation: '確認回收筒內沒有要救回的檔案後再清空。',
  },
  Startup: {
    title: 'Startup',
    what: '登入 Windows 後自動啟動的捷徑或項目。',
    after: '停用後可加快開機或登入後的負載。',
    risk: '可能讓同步、驅動工具或常駐程式不再自動啟動。',
    recommendation: '只檢視與管理，不建議由清理中心自動刪除。',
  },
};

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}

function formatTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

function categoryRows(categories) {
  if (!categories) return [];
  if (Array.isArray(categories)) return categories;
  return Object.entries(categories).map(([name, row]) => ({ name, ...(row || {}) }));
}

function normalizeRisk(risk) {
  if (risk === 'Safe') return RISK_SAFE;
  if (risk === 'Review') return RISK_REVIEW;
  if (risk === 'High risk') return RISK_AVOID;
  return risk || RISK_REVIEW;
}

function riskTone(risk) {
  const normalized = normalizeRisk(risk);
  if (normalized === RISK_PERMANENT || normalized === RISK_AVOID) return 'danger';
  if (normalized === RISK_REVIEW) return 'warn';
  return 'ok';
}

function openPath(targetPath) {
  if (targetPath) window.api.cleanup.openPath(targetPath);
}

export default function CleanCenter() {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeInfo, setActiveInfo] = useState(null);
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    if (!window.api?.cleanup) return;
    // allSettled so one failing IPC doesn't reject the whole load; missing values become null.
    const settled = await Promise.allSettled([
      window.api.cleanup.getSummary
        ? window.api.cleanup.getSummary()
        : window.api.cleanup.getStatus(),
      window.api.cleanup.getLogs(),
    ]);
    const [summaryResult, logsResult] = settled.map((entry) =>
      entry.status === 'fulfilled' ? entry.value : null,
    );
    if (summaryResult?.ok) setStatus(summaryResult);
    if (logsResult?.ok) setLogs(logsResult.logs || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runScan = async () => {
    setBusy(true);
    setReport(null);
    const result = await window.api.cleanup.scan({});
    setBusy(false);
    if (!result.ok) {
      toast(result.error || '掃描失敗', 'error');
      return;
    }
    setScanResult(result);
    setSelected(
      new Set((result.items || []).filter((item) => item.selectedDefault).map((item) => item.id)),
    );
    toast(`掃描完成：找到 ${result.summary.totalCount} 個項目`, 'ok');
    load();
  };

  const items = scanResult?.items || [];
  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );
  const safeSelectedItems = useMemo(
    () => selectedItems.filter((item) => normalizeRisk(item.risk) === RISK_SAFE),
    [selectedItems],
  );
  const selectedSize = selectedItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const safeSelectedSize = safeSelectedItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const selectedNeedsReview = selectedItems.filter(
    (item) => normalizeRisk(item.risk) !== RISK_SAFE,
  ).length;

  const toggleItem = (item) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const cleanItems = async (itemsToClean) => {
    setConfirmOpen(false);
    if (!itemsToClean.length) {
      toast('沒有可清理的安全項目', 'warn');
      return;
    }
    setBusy(true);
    const result = await window.api.cleanup.cleanSelected({ items: itemsToClean });
    setBusy(false);
    setReport(result);
    setSelected(new Set());
    toast(
      `清理完成：成功 ${result.cleaned || 0}，跳過 ${result.skipped || 0}，失敗 ${result.failed || 0}`,
      result.failed ? 'warn' : 'ok',
    );
    await load();
    const refreshed = await window.api.cleanup.scan({});
    if (refreshed.ok) {
      setScanResult(refreshed);
      setSelected(
        new Set(
          (refreshed.items || []).filter((item) => item.selectedDefault).map((item) => item.id),
        ),
      );
    }
  };

  const exportLogs = async () => {
    const result = await window.api.cleanup.exportLogs('json');
    toast(
      result.ok ? `已匯出清理紀錄：${result.path}` : result.error || '匯出失敗',
      result.ok ? 'ok' : 'error',
    );
  };

  const summary = scanResult?.summary || {};
  const rows = categoryRows(scanResult?.categories);
  const reportReasons = report?.report?.failureReasons || [];

  return (
    <div className="cleanup-page">
      <PageHeader
        eyebrow="ORGANIZE"
        title="Clean Center"
        description="以保守規則掃描暫存、快取、大檔與重複檔案；清理前先確認，清理後提供完整報告。"
        actions={
          <>
            <Button variant="ghost" onClick={exportLogs}>
              匯出紀錄
            </Button>
            <Button variant="primary" onClick={runScan} busy={busy}>
              重新掃描
            </Button>
          </>
        }
      />

      <InlineAlert tone="warn" title="安全清理規則">
        Windows Temp / User Temp 只會預設勾選最後修改超過 7 天的檔案；24 小時內的檔案、Installer /
        Driver / Windows Update 相關暫存、以及 Downloads / Desktop / Documents
        內的檔案不會自動清理。
      </InlineAlert>

      <div className="metric-grid cleanup-summary-grid">
        <div className="card status-card">
          <div className="label">掃描項目</div>
          <div className="value">{summary.totalCount ?? '--'}</div>
          <div className="sub">目前掃描到的可檢視項目</div>
        </div>
        <div className="card status-card">
          <div className="label">可檢視容量</div>
          <div className="value">{formatBytes(summary.totalSize)}</div>
          <div className="sub">包含需確認與不建議自動清理項目</div>
        </div>
        <div className="card status-card">
          <div className="label">預設安全勾選</div>
          <div className="value">{formatBytes(summary.selectedDefaultSize)}</div>
          <div className="sub">符合保守規則的安全清理項目</div>
        </div>
        <div className="card status-card">
          <div className="label">需人工確認</div>
          <div className="value">{summary.highRiskCount || 0}</div>
          <div className="sub">不建議自動清理或永久刪除</div>
        </div>
      </div>

      <SectionPanel
        title="分類掃描結果"
        description="每個分類都可以打開說明，先了解清理後的影響再決定。"
      >
        <DataTable
          rows={rows}
          emptyTitle="尚未掃描"
          emptyDescription="按下重新掃描後，會列出 Windows Temp、User Temp、Browser Cache、Large Files 等分類。"
          columns={[
            { key: 'name', label: '分類', render: (row) => row.name || row.category },
            { key: 'count', label: '數量' },
            { key: 'size', label: '容量', render: (row) => formatBytes(row.size) },
            {
              key: 'risk',
              label: '風險等級',
              render: (row) => (
                <StatusBadge tone={riskTone(row.risk)}>{normalizeRisk(row.risk)}</StatusBadge>
              ),
            },
            {
              key: 'status',
              label: '狀態',
              render: (row) => (row.status === 'Disabled' ? '停用' : '已掃描'),
            },
            {
              key: 'info',
              label: '說明',
              render: (row) => (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveInfo(row.name || row.category)}
                >
                  說明
                </Button>
              ),
            },
          ]}
        />
      </SectionPanel>

      <SectionPanel
        title="檔案明細"
        description={`已選 ${selectedItems.length} 個項目，預估釋放 ${formatBytes(selectedSize)}。`}
        actions={
          <Button
            variant="danger"
            disabled={selectedItems.length === 0 || busy}
            onClick={() => setConfirmOpen(true)}
          >
            清理已選項目
          </Button>
        }
      >
        {selectedNeedsReview ? (
          <InlineAlert tone="danger" title="包含需人工確認項目">
            已選項目中有 {selectedNeedsReview}{' '}
            個不是「安全清理」。你仍可清理，但建議先檢查來源路徑與清理影響。
          </InlineAlert>
        ) : null}
        <DataTable
          rows={items.slice(0, 500)}
          emptyTitle="尚未找到檔案"
          emptyDescription="重新掃描後會顯示檔名、分類、容量、最後修改時間、風險、來源路徑與清理影響。"
          columns={[
            {
              key: 'select',
              label: '',
              width: 42,
              render: (row) => (
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggleItem(row)}
                />
              ),
            },
            { key: 'fileName', label: '檔名', render: (row) => <strong>{row.fileName}</strong> },
            { key: 'category', label: '分類' },
            { key: 'size', label: '大小', render: (row) => formatBytes(row.size) },
            { key: 'mtime', label: '最後修改時間', render: (row) => formatTime(row.mtime) },
            {
              key: 'risk',
              label: '風險等級',
              render: (row) => (
                <StatusBadge tone={riskTone(row.risk)}>{normalizeRisk(row.risk)}</StatusBadge>
              ),
            },
            {
              key: 'path',
              label: '來源路徑',
              className: 'path',
              render: (row) => (
                <button className="link-button" onClick={() => openPath(row.path)}>
                  {row.path}
                </button>
              ),
            },
            {
              key: 'impact',
              label: '清理影響說明',
              render: (row) => row.cleanImpact || row.impact || '移到資源回收筒，可在清空前還原。',
            },
          ]}
        />
      </SectionPanel>

      {report ? (
        <SectionPanel
          title="清理完成報告"
          description="每次清理都會留下摘要與詳細結果，方便追蹤發生了什麼。"
        >
          <div className="cleanup-report-grid">
            <div>
              <span>成功刪除</span>
              <strong>{report.cleaned || report.report?.successCount || 0}</strong>
            </div>
            <div>
              <span>釋放容量</span>
              <strong>{formatBytes(report.freedSize || report.report?.freedSize)}</strong>
            </div>
            <div>
              <span>跳過數量</span>
              <strong>{report.skipped || report.report?.skippedCount || 0}</strong>
            </div>
            <div>
              <span>失敗數量</span>
              <strong>{report.failed || report.report?.failureCount || 0}</strong>
            </div>
          </div>
          {reportReasons.length ? (
            <div className="cleanup-reason-list">
              <h3>跳過 / 失敗原因</h3>
              {reportReasons.slice(0, 20).map((row, index) => (
                <div className="cleanup-reason-row" key={`${row.path}-${index}`}>
                  <strong>{row.fileName || row.path}</strong>
                  <span>
                    {row.status === 'skipped' ? '跳過' : '失敗'}：{row.reason}
                  </span>
                  <code>{row.path}</code>
                </div>
              ))}
            </div>
          ) : null}
        </SectionPanel>
      ) : null}

      <SectionPanel
        title="掃描與清理紀錄"
        actions={
          <Button size="sm" variant="ghost" onClick={() => window.api.cleanup.openLogFile()}>
            開啟紀錄檔
          </Button>
        }
      >
        <DataTable
          rows={logs.slice(0, 12)}
          emptyTitle="尚無紀錄"
          columns={[
            { key: 'time', label: '時間', render: (row) => formatTime(row.time || row.at) },
            { key: 'action', label: '動作' },
            { key: 'category', label: '分類' },
            { key: 'result', label: '結果' },
            { key: 'fileSize', label: '容量', render: (row) => formatBytes(row.fileSize) },
          ]}
        />
      </SectionPanel>

      {activeInfo ? (
        <div className="dialog-overlay" role="presentation" onClick={() => setActiveInfo(null)}>
          <div
            className="dialog cleanup-info-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{categoryInfo[activeInfo]?.title || activeInfo}</h3>
            <dl className="cleanup-info-list">
              <dt>這個分類是什麼</dt>
              <dd>
                {categoryInfo[activeInfo]?.what || '此分類用於顯示 Clean Center 掃描到的項目。'}
              </dd>
              <dt>清理後會發生什麼</dt>
              <dd>
                {categoryInfo[activeInfo]?.after ||
                  '項目會依清理方式移到資源回收筒或等待人工處理。'}
              </dd>
              <dt>可能風險</dt>
              <dd>{categoryInfo[activeInfo]?.risk || '請先確認來源路徑與檔案用途。'}</dd>
              <dt>建議是否清理</dt>
              <dd>{categoryInfo[activeInfo]?.recommendation || '建議確認後再清理。'}</dd>
            </dl>
            <div className="dialog-actions">
              <Button variant="primary" onClick={() => setActiveInfo(null)}>
                了解
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="dialog-overlay" role="presentation" onClick={() => setConfirmOpen(false)}>
          <div
            className="dialog cleanup-confirm-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>確認清理已選項目</h3>
            <div className="cleanup-confirm-summary">
              <div>
                <span>即將清理</span>
                <strong>{selectedItems.length} 個檔案</strong>
              </div>
              <div>
                <span>預估釋放</span>
                <strong>{formatBytes(selectedSize)}</strong>
              </div>
              <div>
                <span>安全項目</span>
                <strong>
                  {safeSelectedItems.length} 個 / {formatBytes(safeSelectedSize)}
                </strong>
              </div>
            </div>
            <InlineAlert tone="danger" title="清理前提醒">
              若有程式正在安裝、更新、下載或編譯，清理暫存檔可能導致該任務失敗。無法刪除或被鎖定的檔案會直接跳過，不會強制刪除。
            </InlineAlert>
            <div className="dialog-actions">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                取消
              </Button>
              <Button
                disabled={!safeSelectedItems.length || busy}
                onClick={() => cleanItems(safeSelectedItems)}
              >
                只清理安全項目
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => cleanItems(selectedItems)}>
                仍要清理
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
