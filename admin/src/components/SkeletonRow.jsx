// Phase 4 / 04-04 / A-M4 / UX-09 — admin table-row skeleton.
// Renders `rows` × <tr> placeholders with `columns` × shimmer cells.
// CSS shimmer keyframe is inline — no additional CSS file needed.
import React from 'react';

const SHIMMER_STYLE_ID = 'admin-skeleton-shimmer-style';

function ensureShimmerStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SHIMMER_STYLE_ID;
  style.textContent = `
    @keyframes admin-shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .admin-skeleton-block {
      display: block;
      width: 100%;
      height: 14px;
      border-radius: 4px;
      background: linear-gradient(90deg,
        var(--surface-variant, #e5e7eb) 0%,
        var(--surface, #f3f4f6) 50%,
        var(--surface-variant, #e5e7eb) 100%);
      background-size: 200% 100%;
      animation: admin-shimmer 1.2s linear infinite;
    }
    .admin-skeleton-row td { padding: 12px 16px; }
  `;
  document.head.appendChild(style);
}

export function SkeletonRow({ columns = 5, rows = 5 }) {
  ensureShimmerStyle();
  const rowList = Array.from({ length: rows });
  const colList = Array.from({ length: columns });
  return (
    <>
      {rowList.map((_, i) => (
        <tr key={`sk-${i}`} className="admin-skeleton-row" aria-hidden="true">
          {colList.map((__, j) => (
            <td key={`sk-${i}-${j}`}>
              <div className="admin-skeleton-block" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
