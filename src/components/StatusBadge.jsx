import React from 'react';

// tone: 'ok' | 'warn' | 'danger' | 'muted'
export default function StatusBadge({ tone = 'muted', children }) {
  return (
    <span className={`status-badge ${tone}`}>
      <span className="dot" />
      {children}
    </span>
  );
}
