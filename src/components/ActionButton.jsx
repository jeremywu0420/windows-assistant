import React from 'react';

export default function ActionButton({
  children,
  icon,
  onClick,
  variant = 'default',
  disabled = false,
  busy = false,
}) {
  return (
    <button className={`action-btn ${variant}`} onClick={onClick} disabled={disabled || busy}>
      {busy ? <span className="spinner" /> : icon ? <span>{icon}</span> : null}
      {children}
    </button>
  );
}
