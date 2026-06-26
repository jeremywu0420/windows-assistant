import React, { useCallback, useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import DataTable from '../components/DataTable.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';

function formatTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
}

function tone(level) {
  if (level === 'danger' || level === 'error') return 'danger';
  if (level === 'warn') return 'warn';
  if (level === 'ok') return 'ok';
  return 'muted';
}

export default function NotificationCenter({ onNavigate }) {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const result = await window.api.listNotifications();
    if (result.ok) {
      setEvents(result.events || []);
      setUnread(result.unreadCount || 0);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const markAllRead = async () => {
    await window.api.markNotificationRead();
    toast('已全部標示為已讀', 'ok');
    load();
  };

  const clearAll = async () => {
    await window.api.clearNotifications();
    toast('通知中心已清空', 'ok');
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="SYSTEM"
        title="通知中心"
        description="集中顯示健康守護、自動化、Clean Center、更新與系統事件。"
        actions={
          <>
            <StatusBadge tone={unread ? 'warn' : 'ok'}>{unread} 個未讀</StatusBadge>
            <Button variant="ghost" onClick={markAllRead}>
              全部已讀
            </Button>
            <Button variant="danger" onClick={clearAll}>
              清空
            </Button>
          </>
        }
      />

      <SectionPanel title="事件清單" description="有下一步動作的事件可以直接前往相關頁面處理。">
        <DataTable
          rows={events}
          emptyTitle="目前沒有通知"
          emptyDescription="健康守護與自動化觸發後會出現在這裡。"
          columns={[
            { key: 'time', label: '時間', render: (row) => formatTime(row.time) },
            {
              key: 'level',
              label: '等級',
              render: (row) => (
                <StatusBadge tone={tone(row.level)}>{row.level || 'info'}</StatusBadge>
              ),
            },
            { key: 'title', label: '標題', render: (row) => <strong>{row.title}</strong> },
            { key: 'body', label: '內容' },
            { key: 'source', label: '來源' },
            {
              key: 'action',
              label: '動作',
              render: (row) =>
                row.action ? (
                  <Button size="sm" onClick={() => onNavigate(row.action)}>
                    前往
                  </Button>
                ) : (
                  '--'
                ),
            },
          ]}
        />
      </SectionPanel>
    </div>
  );
}
