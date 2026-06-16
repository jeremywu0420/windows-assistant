import React from 'react';

export default function Card({ title, icon, actions, children, style }) {
  return (
    <div className="card" style={style}>
      {title || actions ? (
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>
            {icon ? <span style={{ marginRight: 6 }}>{icon}</span> : null}
            {title}
          </div>
          {actions ? <div style={{ display: 'flex', gap: 8 }}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
