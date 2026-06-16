'use strict';

const { Notification } = require('electron');

/** Thin wrapper around Electron's native desktop notifications. */
function notify(title, body) {
  try {
    if (!Notification.isSupported()) return { ok: false, error: '系統不支援通知' };
    const n = new Notification({ title: title || 'PC Life Assistant', body: body || '' });
    n.show();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { notify };
