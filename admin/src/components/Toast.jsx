// Phase 4 / 04-04 / UX-09 / D-17 — admin Vite-native Toast.
// Tiny Zustand-backed queue + ToastHost mounted once near root.
// Usage: useAdminToast.getState().push({ type:'success', message:'Сохранение выполнено' })
import React, { useEffect } from 'react';
import { create } from 'zustand';

// Cap at 5 entries to bound DoS surface (T-04-04-05).
export const useAdminToast = create((set) => ({
  queue: [],
  push: (entry) =>
    set((s) => ({
      queue: [
        ...s.queue,
        {
          id:
            (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
            `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: entry.type || 'info',
          message: String(entry.message ?? ''),
        },
      ].slice(-5),
    })),
  dismiss: (id) =>
    set((s) => ({ queue: s.queue.filter((e) => e.id !== id) })),
  clear: () => set({ queue: [] }),
}));

const TYPE_BG = {
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

export function ToastHost() {
  const queue = useAdminToast((s) => s.queue);
  const dismiss = useAdminToast((s) => s.dismiss);

  useEffect(() => {
    if (!queue.length) return undefined;
    const timers = queue.map((e) => setTimeout(() => dismiss(e.id), 4000));
    return () => timers.forEach(clearTimeout);
  }, [queue, dismiss]);

  return (
    <div
      className="admin-toast-host"
      role="region"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {queue.map((e) => (
        <div
          key={e.id}
          className={`admin-toast admin-toast-${e.type}`}
          onClick={() => dismiss(e.id)}
          role={e.type === 'error' ? 'alert' : 'status'}
          style={{
            pointerEvents: 'auto',
            cursor: 'pointer',
            background: TYPE_BG[e.type] || TYPE_BG.info,
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            minWidth: 240,
            maxWidth: 360,
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          }}
        >
          {e.message}
        </div>
      ))}
    </div>
  );
}
