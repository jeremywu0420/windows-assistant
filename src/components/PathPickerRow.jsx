import React from 'react';
import Button from './Button.jsx';

export default function PathPickerRow({
  label,
  description,
  value,
  onPick,
  onDetect,
  onChange,
  placeholder,
}) {
  return (
    <div className="path-picker-row">
      <div className="path-picker-main">
        <div className="label">{label}</div>
        {description ? <div className="desc">{description}</div> : null}
        <input
          className="path-input"
          value={value || ''}
          placeholder={placeholder || '尚未設定'}
          onChange={(event) => onChange && onChange(event.target.value)}
        />
      </div>
      <div className="head-actions">
        {onDetect ? (
          <Button size="sm" icon="AU" onClick={onDetect}>
            自動偵測
          </Button>
        ) : null}
        {onPick ? (
          <Button size="sm" icon="PK" onClick={onPick}>
            手動選擇
          </Button>
        ) : null}
      </div>
    </div>
  );
}
