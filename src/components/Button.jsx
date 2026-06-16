import React from 'react';

export default function Button({
  children,
  icon,
  onClick,
  variant = 'default', // default | primary | ghost | danger
  size, // 'sm' | undefined
  disabled = false,
  busy = false,
  type = 'button',
  title,
}) {
  const cls = ['ui-btn', variant, size === 'sm' ? 'sm' : '', !children ? 'icon-only' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} onClick={onClick} disabled={disabled || busy} type={type} title={title}>
      {busy ? <span className="spinner" /> : icon ? <span>{icon}</span> : null}
      {children}
    </button>
  );
}
