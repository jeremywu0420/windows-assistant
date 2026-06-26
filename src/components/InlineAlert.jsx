import React from 'react';

export default function InlineAlert({ tone = 'info', title, children }) {
  return (
    <div className={`inline-alert ${tone}`}>
      <span className="inline-alert-icon">
        {tone === 'danger' ? 'ER' : tone === 'warn' ? 'WA' : tone === 'ok' ? 'OK' : 'IN'}
      </span>
      <div>
        {title ? <div className="inline-alert-title">{title}</div> : null}
        {children ? <div className="inline-alert-body">{children}</div> : null}
      </div>
    </div>
  );
}
