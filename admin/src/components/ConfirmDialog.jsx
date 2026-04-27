// Phase 4 / 04-04 — admin destructive-confirm modal (parallel to mobile ConfirmDialog).
// Phase 4.5 / 04.5-01 — extended with `requireTypedConfirmation` + `typedPrompt`
// props for the ADMIN-12 hard-delete flow. When `requireTypedConfirmation` is
// truthy, a text input is rendered and the confirm button stays disabled until
// the typed value matches the prop exactly (case-sensitive). The typed state
// resets to '' on every open transition false→true so reopening the dialog
// always starts fresh.
import React, { useEffect, useState } from 'react';

export function ConfirmDialog({
  open,
  title = 'Подтвердите действие',
  message,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  destructive = true,
  requireTypedConfirmation, // string — when truthy, enables typed-confirmation UX
  typedPrompt,              // string — Russian instruction; default below
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState('');

  // Phase 4.5 / 04.5-01 — reset typed input on every open transition false → true
  // so the dialog always starts with an empty input (test 5 in the typed-
  // confirmation suite pins this contract).
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const needsTyped = Boolean(requireTypedConfirmation);
  const canConfirm = !needsTyped || typed === requireTypedConfirmation;
  const promptText = typedPrompt || `Введите ${requireTypedConfirmation} для подтверждения:`;

  function handleKeyDown(e) {
    if (e.key === 'Enter' && canConfirm) onConfirm?.();
  }

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
        {needsTyped ? (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant, #475569)', marginBottom: 8 }}>
              {promptText}
            </p>
            <input
              type="text"
              className="form-input"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Введите подтверждение"
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid var(--outline, #cbd5e1)',
                borderRadius: 8,
                fontSize: 14,
              }}
            />
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={!canConfirm}
            style={
              destructive
                ? {
                    background: canConfirm ? '#ef4444' : '#fca5a5',
                    color: '#fff',
                    cursor: canConfirm ? 'pointer' : 'not-allowed',
                  }
                : { cursor: canConfirm ? 'pointer' : 'not-allowed' }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
