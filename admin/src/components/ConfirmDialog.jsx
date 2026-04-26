// Phase 4 / 04-04 — admin destructive-confirm modal (parallel to mobile ConfirmDialog).
// Used by Phase 4.5 admin CRUD wherever a destructive action needs confirmation
// (delete card, deactivate user, etc.) — replaces native `confirm(...)` calls.
import React, { useEffect } from 'react';

export function ConfirmDialog({
  open,
  title = 'Подтвердите действие',
  message,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  destructive = true,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="admin-confirm-overlay modal-overlay"
      onClick={onCancel}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        className="admin-confirm modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-card, #fff)',
          padding: 24,
          borderRadius: 12,
          minWidth: 320,
          maxWidth: 420,
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{title}</h2>
        {message ? (
          <p style={{ fontSize: 14, color: 'var(--on-surface-variant, #475569)', marginBottom: 20 }}>
            {message}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            style={destructive ? { background: '#ef4444', color: '#fff' } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
