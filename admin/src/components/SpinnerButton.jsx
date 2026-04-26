// Phase 4 / 04-04 / A-M2 — admin mutation button with spinner + disabled state.
// Used wherever a form submits or a destructive action mutates server state.
// While `loading=true`: button is disabled, aria-label='Выполняется…',
// onClick is a no-op, spinner span is rendered.
import React from 'react';

export function SpinnerButton({
  loading = false,
  disabled = false,
  children,
  onClick,
  type = 'button',
  className,
  style,
  ...rest
}) {
  const isDisabled = loading || disabled;
  const handleClick = (e) => {
    if (loading) return;
    if (typeof onClick === 'function') onClick(e);
  };
  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={loading ? 'Выполняется…' : undefined}
      aria-busy={loading || undefined}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        opacity: isDisabled ? 0.7 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <span className="admin-spinner" aria-hidden="true">
          ⏳
        </span>
      ) : null}
      <span style={{ opacity: loading ? 0.6 : 1 }}>{children}</span>
    </button>
  );
}
