import React, { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import SectionPanel from '../components/SectionPanel.jsx';
import Button from '../components/Button.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useToast } from '../components/Toast.jsx';

const GROUP_LABELS = {
  Core: '核心開發',
  Embedded: '嵌入式 / 微控制器',
  HDL: 'HDL / FPGA 模擬',
  Build: '建置系統',
  EDA: 'EDA / 電路',
  Numerical: '數值運算',
};

const monoStyle = { fontFamily: '"Cascadia Code","Consolas",monospace' };

export default function ToolchainDoctor() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    if (!window.api?.checkToolchains) {
      setError('此功能需要在桌面應用程式中執行。');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await window.api.checkToolchains();
      if (result?.ok) setReport(result);
      else setError(result?.error || '檢查失敗。');
    } catch (err) {
      setError(err?.message || '檢查失敗。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const copyHint = async (text) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      toast('已複製安裝指令', 'ok');
    } catch (_) {
      toast('複製失敗，請手動選取', 'error');
    }
  };

  const summary = report ? (
    <StatusBadge tone={report.missing === 0 ? 'ok' : 'warn'}>
      {report.installed} / {report.total} 已安裝
    </StatusBadge>
  ) : null;

  return (
    <div>
      <PageHeader
        eyebrow="ENVIRONMENT"
        title="環境健檢"
        description="偵測開發與電機相關工具鏈是否已安裝、版本與 PATH。工作區模板會用到這些工具，先在這裡確認環境就緒。"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {summary}
            <Button variant="primary" onClick={run} busy={loading}>
              重新檢查
            </Button>
          </div>
        }
      />

      {error ? (
        <SectionPanel>
          <EmptyState title="無法檢查" description={error} />
        </SectionPanel>
      ) : null}

      {!error && loading && !report ? (
        <SectionPanel>
          <EmptyState title="檢查中…" description="正在偵測各工具鏈，請稍候。" />
        </SectionPanel>
      ) : null}

      {!error && report
        ? report.groups.map((group) => (
            <SectionPanel
              key={group.name}
              title={GROUP_LABELS[group.name] || group.name}
              eyebrow={group.name.toUpperCase()}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.tools.map((tool) => (
                  <div
                    key={tool.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      background: 'var(--surface)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <strong>{tool.label}</strong>
                        <code style={{ ...monoStyle, fontSize: 12, opacity: 0.7 }}>{tool.cmd}</code>
                        {tool.installed && tool.version ? (
                          <span className="status-badge ok" style={{ fontSize: 12 }}>
                            v{tool.version}
                          </span>
                        ) : null}
                      </div>
                      {tool.installed ? (
                        <div
                          className="muted"
                          style={{
                            ...monoStyle,
                            fontSize: 12,
                            marginTop: 4,
                            wordBreak: 'break-all',
                          }}
                        >
                          {tool.path}
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            marginTop: 6,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span className="muted" style={{ fontSize: 12 }}>
                            安裝：
                          </span>
                          <code style={{ ...monoStyle, fontSize: 12 }}>{tool.hint}</code>
                          {tool.hint?.startsWith('winget') || tool.hint?.startsWith('http') ? (
                            <Button size="sm" variant="ghost" onClick={() => copyHint(tool.hint)}>
                              複製
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <StatusBadge tone={tool.installed ? 'ok' : 'danger'}>
                      {tool.installed ? '已安裝' : '未安裝'}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </SectionPanel>
          ))
        : null}
    </div>
  );
}
