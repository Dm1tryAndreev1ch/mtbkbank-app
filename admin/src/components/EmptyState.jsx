// admin/src/components/EmptyState.jsx
//
// Phase 4.5 / 04.5-01 / Task 5 — shared empty-state primitive used by every
// list page in the admin SPA per UI-SPEC §State Matrix. Renders a centered
// block with optional Material-Icons-Outlined glyph + Russian heading + body.
// Tokens via index.css custom properties — no inline hex literals.

import React from 'react';

export function EmptyState({ heading, body, icon }) {
  return (
    <div
      style={{
        minHeight: 240,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 32,
      }}
    >
      {icon ? (
        <span
          className="material-icons-outlined"
          aria-hidden="true"
          style={{ fontSize: 48, color: 'var(--outline)' }}
        >
          {icon}
        </span>
      ) : null}
      <h3 style={{ margin: 0, color: 'var(--on-surface)' }}>{heading}</h3>
      {body ? (
        <p style={{ margin: 0, color: 'var(--on-surface-variant)' }}>{body}</p>
      ) : null}
    </div>
  );
}
