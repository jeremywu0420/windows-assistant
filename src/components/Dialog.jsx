import React from 'react';
import Button from './Button.jsx';

/**
 * Confirm dialog. Controlled via `open`.
 * onConfirm / onCancel are required; `danger` styles the confirm button.
 */
export default function Dialog({
  open,
  title = '確認',
  message,
  confirmLabel = '確認',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div className="dialog-overlay" onMouseDown={onCancel}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message ? <p>{message}</p> : null}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
