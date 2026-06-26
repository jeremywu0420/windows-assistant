import React, { useCallback, useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import DataTable from '../components/DataTable.jsx';
import InlineAlert from '../components/InlineAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

function formatTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
}

function typeTone(type) {
  if (type === 'cleanup') return 'warn';
  if (type === 'notification') return 'muted';
  return 'ok';
}

export default function ActivityHistory() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await window.api.listActivityHistory();
    if (result.ok) setRows(result.rows || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const restoreDownloads = async () => {
    setBusy(true);
    const result = await window.api.restoreDownloadsLastFromHistory();
    setBusy(false);
    toast(
      result.ok ? `已復原 ${result.restored || 0} 個項目` : result.error || '復原失敗',
      result.ok ? 'ok' : 'error',
    );
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="SYSTEM"
        title="活動與復原中心"
        description="集中查看 Downloads、Screenshots、Clean Center 與通知事件，並提供可復原的安全操作入口。"
        actions={
          <Button variant="primary" busy={busy} onClick={restoreDownloads}>
            復原上次 Downloads 整理
          </Button>
        }
      />

      <InlineAlert tone="info" title="復原範圍">
        目前可復原 Downloads 的移動整理紀錄；Clean Center
        是移到資源回收筒，請在資源回收筒清空前還原。
      </InlineAlert>

      <SectionPanel title="活動歷史" description="依時間排序顯示最近 250 筆事件。">
        <DataTable
          rows={rows}
          emptyTitle="尚無活動紀錄"
          columns={[
            { key: 'time', label: '時間', render: (row) => formatTime(row.time) },
            {
              key: 'type',
              label: '類型',
              render: (row) => <StatusBadge tone={typeTone(row.type)}>{row.type}</StatusBadge>,
            },
            { key: 'title', label: '事件', render: (row) => <strong>{row.title}</strong> },
            { key: 'summary', label: '摘要' },
            { key: 'count', label: '數量' },
            { key: 'restorable', label: '可復原', render: (row) => (row.restorable ? '是' : '否') },
          ]}
        />
      </SectionPanel>
    </div>
  );
}
