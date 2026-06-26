import React, { useEffect, useState } from 'react';
import AlertList from '../components/AlertList.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [types, setTypes] = useState({});
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!window.api) {
      setToast({ type: 'error', msg: 'Electron API 尚未就緒，請在桌面 App 內使用。' });
      setLoading(false);
      return;
    }

    setLoading(true);
    const res = await window.api.getRules();
    setRules(res.rules || []);
    setTypes(res.types || {});

    const status = await window.api.getSystemStatus();
    if (status.ok && status.rules) setLiveAlerts(status.rules.alerts || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const update = (id, patch) => {
    setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const save = async () => {
    const res = await window.api.saveRules(rules);
    if (res.ok) {
      setToast({ type: 'ok', msg: '規則已儲存，儀表板會套用新的警示門檻。' });
      const status = await window.api.getSystemStatus();
      if (status.ok && status.rules) setLiveAlerts(status.rules.alerts || []);
    } else {
      setToast({ type: 'error', msg: res.error || '儲存規則失敗' });
    }
  };

  const enabledCount = rules.filter((rule) => rule.enabled !== false).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">SMART RULES</p>
          <h1 className="page-title">智慧規則</h1>
          <p className="page-subtitle">
            調整系統警示門檻，讓 Dashboard 只提醒真正值得注意的 CPU、記憶體和磁碟事件。
          </p>
        </div>
        <div className="head-actions">
          <StatusBadge tone={enabledCount ? 'ok' : 'muted'}>{enabledCount} 個啟用</StatusBadge>
          <Button icon="SV" variant="primary" onClick={save}>
            儲存
          </Button>
          <Button icon="RF" onClick={load}>
            重新載入
          </Button>
        </div>
      </div>

      <Card>
        <div className="section-title">規則清單</div>
        {loading ? (
          <div className="loading-block">
            <span className="spinner" />
            載入規則中
          </div>
        ) : (
          <div className="rule-list">
            {rules.map((rule) => {
              const type = types[rule.type] || {};
              return (
                <div className="rule-row" key={rule.id}>
                  <button
                    className={`toggle ${rule.enabled !== false ? 'on' : ''}`}
                    onClick={() => update(rule.id, { enabled: rule.enabled === false })}
                    title={rule.enabled !== false ? '停用規則' : '啟用規則'}
                    type="button"
                  />
                  <div className="rule-main">
                    <div className="project-title">{rule.label || rule.id}</div>
                    <div className="project-meta">{type.label || rule.type}</div>
                  </div>
                  <div className="inline-controls">
                    <input
                      type="number"
                      value={rule.threshold}
                      onChange={(event) =>
                        update(rule.id, { threshold: Number(event.target.value) })
                      }
                    />
                    <span className="muted">{type.unit || ''}</span>
                    <select
                      value={rule.level || 'warn'}
                      onChange={(event) => update(rule.id, { level: event.target.value })}
                    >
                      <option value="warn">警告</option>
                      <option value="danger">危險</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {toast ? <div className={`toast ${toast.type}`}>{toast.msg}</div> : null}
      </Card>

      <div className="section-title">目前觸發的警示</div>
      <AlertList alerts={liveAlerts} />
    </div>
  );
}
