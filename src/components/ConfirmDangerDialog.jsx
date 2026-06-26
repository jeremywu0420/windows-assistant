import React from 'react';
import Dialog from './Dialog.jsx';

export default function ConfirmDangerDialog({
  open,
  title,
  message,
  confirmLabel = '確認執行',
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog
      open={open}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
