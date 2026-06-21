import React from 'react';

const statusText = {
  normal: '不需採取動作',
  warning: '建議檢查',
  unavailable: '尚未接入本機資料源',
};

function StatusIcon({ status }) {
  if (status === 'normal') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (status === 'warning') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4 21 20H3z" />
        <path d="M12 9v5M12 17h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8" />
    </svg>
  );
}

export default function SecurityCard({
  title,
  description,
  icon,
  status = 'unavailable',
  children,
  actions,
}) {
  return (
    <section className={`security-card ${status}`}>
      <div className="security-card-head">
        <div className="security-card-icon">{icon}</div>
        <div className={`security-state ${status}`}>
          <StatusIcon status={status} />
        </div>
      </div>
      <div className="security-card-copy">
        <h2>{title}</h2>
        <p>{description || statusText[status]}</p>
      </div>
      {children ? <div className="security-card-details">{children}</div> : null}
      {actions ? <div className="security-card-actions">{actions}</div> : null}
    </section>
  );
}
