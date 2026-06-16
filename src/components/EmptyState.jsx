import React from 'react';

export default function EmptyState({ icon = '📭', title = '沒有資料', description, action }) {
  return (
    <div className="empty-state">
      <div className="es-icon">{icon}</div>
      <div className="es-title">{title}</div>
      {description ? <div>{description}</div> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}
