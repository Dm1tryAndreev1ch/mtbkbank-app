import React, { useState, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { useToken } from './auth/TokenContext';
import { AppError } from './errors/AppError';
import { lookup as lookupErrorMessage } from './errors/codebook';
// Phase 4 / 04-04 — admin UX primitives + Zod form hook (A-M1..A-M5).
import { ToastHost, useAdminToast } from './components/Toast';
import { SkeletonRow } from './components/SkeletonRow';
import { SpinnerButton } from './components/SpinnerButton';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EmptyState } from './components/EmptyState';
import { useZodForm } from './lib/useZodForm';
import { loginSchema, phoneSchema, pinSchema, nameSchema } from './lib/schemas';
import { actionToRussianLabel, actionIsDestructive } from './lib/auditCodebook';
import { z } from 'zod';

// Toast helpers — push backend message verbatim on error, Russian success copy on mutation.
function toastSuccess(message) {
  useAdminToast.getState().push({ type: 'success', message });
}
function toastErrorFromAppError(err, fallback = 'Ошибка операции') {
  const msg = err && err.name === 'AppError'
    ? lookupErrorMessage(err.code)
    : fallback;
  useAdminToast.getState().push({ type: 'error', message: msg });
}

const API = '/api/admin';

/**
 * VITE_API_ORIGIN — прямой URL API (см. .env.development).
 * `vite preview` / вкладка Preview часто не проксируют POST → «Cannot POST /api/...».
 * На localhost/127.0.0.1 без env — прямой вызов API (порт см. backend PORT, по умолчанию 3000).
 */
function withApiBase(path) {
  let p = path.startsWith('/') ? path : `/${path}`;
  let base = (import.meta.env.VITE_API_ORIGIN || import.meta.env.VITE_API_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');

  if (!base && typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      base = 'http://127.0.0.1:3000';
    }
  }

  if (!base) return p;
  if (p.startsWith('/api') && /\/api$/i.test(base)) {
    base = base.replace(/\/api$/i, '');
  }
  return `${base}${p}`;
}

function parseJsonBody(text) {
  const raw = (text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

// SEC-06: token is injected by callers from useToken() — no module-level token state.
async function apiFetch(token, path, opts = {}) {
  const res = await fetch(withApiBase(path), {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch { /* non-JSON 5xx */ }
    const code = typeof body.error === 'string' ? body.error : 'GENERIC';
    // body.message is server-supplied. Do NOT render it directly — codebook
    // resolves UI text. Carry it for Sentry breadcrumb only.
    throw new AppError({
      code,
      message: typeof body.message === 'string' ? body.message : code,
      status: res.status,
      requestId: typeof body.requestId === 'string' ? body.requestId : null,
      issues: Array.isArray(body.issues) ? body.issues : null,
    });
  }
  return res.json();
}

// ===== LOGIN =====
// Phase 4 / 04-04 / A-M1 — useZodForm + loginSchema (backend D-15 reuse).
// Phase 4 / 04-04 / A-M2 — SpinnerButton for in-flight submit state.
function LoginPage({ onLogin }) {
  const { setToken } = useToken();
  const { values, errors, setField, blurField, submit } = useZodForm(loginSchema, {
    phone: '',
    pin: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = submit(async (data) => {
    setIsSubmitting(true);
    setError('');
    try {
      const result = await apiFetch(null, '/api/auth/admin-login', {
        method: 'POST',
        body: data,
      });
      setToken(result.token);
      onLogin();
    } catch (err) {
      setError(lookupErrorMessage(err.code) ?? 'Ошибка входа');
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--surface)', padding: 32, borderRadius: 12, width: 340, boxShadow: '0 4px 32px rgba(0,0,0,.12)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>Вход в панель</h1>
        {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="form-group">
          <label className="form-label">Телефон</label>
          <input
            className={`form-input${errors.phone ? ' input-error' : ''}`}
            type="tel" placeholder="+375291234567"
            value={values.phone}
            onChange={e => setField('phone', e.target.value)}
            onBlur={() => blurField('phone')}
            autoComplete="username"
          />
          {errors.phone && <small className="admin-error">{errors.phone}</small>}
        </div>
        <div className="form-group">
          <label className="form-label">PIN</label>
          <input
            className={`form-input${errors.pin ? ' input-error' : ''}`}
            type="password" placeholder="••••"
            value={values.pin}
            onChange={e => setField('pin', e.target.value)}
            onBlur={() => blurField('pin')}
            autoComplete="current-password"
          />
          {errors.pin && <small className="admin-error">{errors.pin}</small>}
        </div>
        <SpinnerButton type="submit" loading={isSubmitting} className="btn btn-primary" style={{ width: '100%', marginTop: 8 }}>
          Войти
        </SpinnerButton>
      </form>
    </div>
  );
}

// ===== JWT helpers =====
function decodeJwtUserId(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.userId === 'string' ? payload.userId : null;
  } catch {
    return null;
  }
}

// ===== Error display helpers =====
function formatPageError(err) {
  if (!err) return null;
  if (err.name === 'AppError') return lookupErrorMessage(err.code) ?? 'Неизвестная ошибка';
  return err.message ?? 'Неизвестная ошибка';
}

function PageErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="error-banner" style={{ marginBottom: 16, flexShrink: 0 }}>
      {message}
    </div>
  );
}

// ===== Zod schemas for admin forms =====
const userEditAdminSchema = z.object({
  name: nameSchema,
  mbPoints: z.coerce.number().int().min(0),
  status: z.enum(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM', 'BLOCKED']),
});

const userCreateAdminSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  pin: pinSchema,
  mbPoints: z.coerce.number().int().min(0).optional().default(0),
  status: z.enum(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM', 'BLOCKED']).optional().default('STANDARD'),
});

// ===== USERS PAGE =====
function UsersPage() {
  const { token } = useToken();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  // Phase 4.5 / 04.5-05 / ADMIN-12 — soft/hard delete state.
  const [confirm, setConfirm] = useState(null); // { kind: 'soft'|'hard', user } | null
  const [mutatingId, setMutatingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const currentAdminId = decodeJwtUserId(token);

  // A-M1/A-M3 — Zod forms.
  const editForm = useZodForm(userEditAdminSchema, { name: '', mbPoints: 0, status: 'STANDARD' });
  const createForm = useZodForm(userCreateAdminSchema, {
    name: '', phone: '', pin: '', mbPoints: 0, status: 'STANDARD',
  });

  // FIX: API returns { users, total, limit, offset } — extract .users array
  // Search by ID/name/phone via ?search= query param (ADMIN-SEARCH fix).
  const load = (q = searchQuery) => {
    setLoading(true);
    const params = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
    apiFetch(token, `${API}/users${params}`)
      .then(data => setUsers(data.users ?? []))
      .catch((e) => { setPageError(formatPageError(e)); toastErrorFromAppError(e, 'Не удалось загрузить пользователей'); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(''); }, [token]);

  const handleSave = editForm.submit(async (data) => {
    setIsSavingEdit(true);
    try {
      await apiFetch(token, `${API}/users/${editing}`, { method: 'PUT', body: data });
      setEditing(null);
      toastSuccess('Сохранение выполнено');
      load();
    } catch (err) {
      setPageError(formatPageError(err));
      toastErrorFromAppError(err, 'Не удалось сохранить пользователя');
    } finally {
      setIsSavingEdit(false);
    }
  });

  const handleCreate = createForm.submit(async (data) => {
    setIsCreating(true);
    try {
      await apiFetch(token, `${API}/users`, { method: 'POST', body: data });
      setShowCreate(false);
      createForm.reset({ name: '', phone: '', pin: '', mbPoints: 0, status: 'STANDARD' });
      toastSuccess('Сохранение выполнено');
      load();
    } catch (err) {
      setPageError(formatPageError(err));
      toastErrorFromAppError(err, 'Не удалось создать пользователя');
    } finally {
      setIsCreating(false);
    }
  });

  // Phase 4.5 / 04.5-05 / ADMIN-12 — soft/hard delete handlers.
  async function softDelete(id) {
    setMutatingId(id);
    try {
      await apiFetch(token, `${API}/users/${id}?mode=soft`, { method: 'DELETE' });
      toastSuccess('Пользователь архивирован');
      load();
    } catch (err) {
      setPageError(formatPageError(err));
      toastErrorFromAppError(err, 'Не удалось архивировать пользователя');
    } finally {
      setMutatingId(null);
      setConfirm(null);
    }
  }
  async function hardDelete(id) {
    setMutatingId(id);
    try {
      await apiFetch(token, `${API}/users/${id}?mode=hard`, { method: 'DELETE' });
      toastSuccess('Пользователь удалён');
      load();
    } catch (err) {
      setPageError(formatPageError(err));
      toastErrorFromAppError(err, 'Не удалось удалить пользователя');
    } finally {
      setMutatingId(null);
      setConfirm(null);
    }
  }

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div><h1 className="page-title">Пользователи</h1><p className="page-subtitle">Управление аккаунтами</p></div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>add</span> Создать
          </button>
        </div>
        <div className="admin-page-scroll">
          <PageErrorBanner message={pageError} />
          <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
            <input
              type="search"
              className="form-input"
              placeholder="Поиск по ID, имени или телефону"
              value={searchQuery}
              onChange={e => {
                const q = e.target.value;
                setSearchQuery(q);
                load(q);
              }}
              style={{ maxWidth: 340 }}
            />
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Имя</th><th>Телефон</th><th>MB Баллы</th><th>Статус</th><th>Карты</th><th>Действия</th></tr></thead>
              <tbody>
                {/* A-M4 — render skeleton rows while loading */}
                {loading && users.length === 0 ? (
                  <SkeletonRow columns={6} rows={5} />
                ) : users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.name}</td>
                    <td>{u.phone}</td>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{u.mbPoints?.toLocaleString()}</td>
                    <td><span className={`badge badge-${u.status?.toLowerCase()}`}>{u.status}</span></td>
                    <td>{u._count?.userCards || 0}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-primary" onClick={() => {
                          setEditing(u.id);
                          editForm.reset({ name: u.name, mbPoints: u.mbPoints ?? 0, status: u.status || 'STANDARD' });
                        }}>
                          Изменить
                        </button>
                        {/* Phase 4.5 / 04.5-05 / ADMIN-12 — soft/hard delete CTAs. */}
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => setConfirm({ kind: 'soft', user: u })}
                          disabled={mutatingId === u.id}
                        >
                          Архивировать
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => setConfirm({ kind: 'hard', user: u })}
                          disabled={mutatingId === u.id || u.id === currentAdminId}
                          title={u.id === currentAdminId ? 'Невозможно удалить свой аккаунт' : undefined}
                        >
                          Удалить навсегда
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && users.length === 0 && (
              <EmptyState heading="Пользователи не найдены" body="Измените поисковый запрос или сбросьте фильтр." icon="search_off" />
            )}
          </div>
        </div>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSave}>
            <h2 className="modal-title">Редактировать пользователя</h2>
            <div className="form-group">
              <label className="form-label">Имя</label>
              <input
                className="form-input"
                value={editForm.values.name || ''}
                onChange={e => editForm.setField('name', e.target.value)}
                onBlur={() => editForm.blurField('name')}
              />
              {editForm.errors.name && <small className="admin-error" style={{ color: 'var(--error)' }}>{editForm.errors.name}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">MB Баллы</label>
              <input
                className="form-input"
                type="number"
                value={editForm.values.mbPoints ?? 0}
                onChange={e => editForm.setField('mbPoints', e.target.value)}
                onBlur={() => editForm.blurField('mbPoints')}
              />
              {editForm.errors.mbPoints && <small className="admin-error" style={{ color: 'var(--error)' }}>{editForm.errors.mbPoints}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Статус</label>
              <select
                className="form-select"
                value={editForm.values.status || ''}
                onChange={e => editForm.setField('status', e.target.value)}
                onBlur={() => editForm.blurField('status')}
              >
                <option value="STANDARD">Standard</option><option value="SILVER">Silver</option><option value="GOLD">Gold</option><option value="PLATINUM">Platinum</option><option value="BLOCKED">Blocked</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setEditing(null)}>Отмена</button>
              <SpinnerButton type="submit" loading={isSavingEdit} className="btn btn-primary">Сохранить</SpinnerButton>
            </div>
          </form>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleCreate}>
            <h2 className="modal-title">Создать пользователя</h2>
            <div className="form-group">
              <label className="form-label">Имя</label>
              <input
                className="form-input"
                value={createForm.values.name || ''}
                onChange={e => createForm.setField('name', e.target.value)}
                onBlur={() => createForm.blurField('name')}
              />
              {createForm.errors.name && <small className="admin-error">{createForm.errors.name}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Телефон</label>
              <input
                className="form-input"
                type="tel"
                value={createForm.values.phone || ''}
                onChange={e => createForm.setField('phone', e.target.value)}
                onBlur={() => createForm.blurField('phone')}
              />
              {createForm.errors.phone && <small className="admin-error">{createForm.errors.phone}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">PIN</label>
              <input
                className="form-input"
                type="password"
                value={createForm.values.pin || ''}
                onChange={e => createForm.setField('pin', e.target.value)}
                onBlur={() => createForm.blurField('pin')}
              />
              {createForm.errors.pin && <small className="admin-error">{createForm.errors.pin}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">MB Баллы</label>
              <input
                className="form-input"
                type="number"
                value={createForm.values.mbPoints ?? 0}
                onChange={e => createForm.setField('mbPoints', e.target.value)}
                onBlur={() => createForm.blurField('mbPoints')}
              />
              {createForm.errors.mbPoints && <small className="admin-error">{createForm.errors.mbPoints}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Статус</label>
              <select
                className="form-select"
                value={createForm.values.status || ''}
                onChange={e => createForm.setField('status', e.target.value)}
                onBlur={() => createForm.blurField('status')}
              >
                <option value="STANDARD">Standard</option><option value="SILVER">Silver</option><option value="GOLD">Gold</option><option value="PLATINUM">Platinum</option><option value="BLOCKED">Blocked</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Отмена</button>
              <SpinnerButton type="submit" loading={isCreating} className="btn btn-primary">Создать</SpinnerButton>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'hard' ? 'Удалить навсегда?' : 'Архивировать пользователя?'}
        body={
          confirm?.kind === 'hard'
            ? `Пользователь «${confirm?.user?.name}» и все его данные будут удалены безвозвратно.`
            : `Пользователь «${confirm?.user?.name}» будет архивирован и скрыт из списка.`
        }
        confirmLabel={confirm?.kind === 'hard' ? 'Удалить' : 'Архивировать'}
        destructive={confirm?.kind === 'hard'}
        loading={!!mutatingId}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'hard') hardDelete(confirm.user.id);
          else softDelete(confirm.user.id);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
