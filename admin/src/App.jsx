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

// ===== ROOT APP =====
const NAV_ITEMS = [
  { key: 'dashboard',    label: 'Дашборд',     icon: 'dashboard' },
  { key: 'users',        label: 'Пользователи', icon: 'people' },
  { key: 'accounts',     label: 'Счета',        icon: 'account_balance' },
  { key: 'transactions', label: 'Операции',     icon: 'receipt_long' },
  { key: 'cards',        label: 'Карты',        icon: 'style' },
  { key: 'simulate',     label: 'Симуляция',    icon: 'play_circle' },
  { key: 'audit',        label: 'Аудит',        icon: 'manage_search' },
];

// Lazy page registry — each key maps to a component.
// Pages that were defined earlier in this file are referenced directly.
// DashboardPage, AccountsPage, TransactionsPage, CardsPage, SimulatePage,
// AuditPage are defined in the rest of this module (below UsersPage).
// If a page component is missing it will be surfaced as a clear error.
function PageNotFound({ page }) {
  return (
    <div className="admin-page">
      <div className="page-header">
        <h1 className="page-title">Страница не найдена</h1>
        <p className="page-subtitle">Компонент для «{page}» не зарегистрирован.</p>
      </div>
    </div>
  );
}

export default function App() {
  const { token, setToken } = useToken();
  const [authed, setAuthed] = useState(false);
  const [page, setPage] = useState('dashboard');

  // Restore auth from token already in context (e.g. memory after HMR).
  useEffect(() => {
    if (token) setAuthed(true);
  }, []);

  if (!authed) {
    return (
      <>
        <ToastHost />
        <LoginPage onLogin={() => setAuthed(true)} />
      </>
    );
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <DashboardPage />;
      case 'users':        return <UsersPage />;
      case 'accounts':     return <AccountsPage />;
      case 'transactions': return <TransactionsPage />;
      case 'cards':        return <CardsPage />;
      case 'simulate':     return <SimulatePage />;
      case 'audit':        return <AuditPage />;
      default:             return <PageNotFound page={page} />;
    }
  };

  return (
    <div className="admin-layout">
      <ToastHost />
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>MT</span>
          <span style={{ fontWeight: 400, fontSize: 14, color: 'var(--on-surface-variant)', marginLeft: 4 }}>Admin</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              className={`nav-item${page === item.key ? ' nav-item-active' : ''}`}
              onClick={() => setPage(item.key)}
            >
              <span className="material-icons-outlined nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className="btn btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { setToken(null); setAuthed(false); setPage('dashboard'); }}
          >
            <span className="material-icons-outlined" style={{ fontSize: 16, marginRight: 4 }}>logout</span>
            Выйти
          </button>
        </div>
      </aside>
      <main className="admin-main">
        {renderPage()}
      </main>
    </div>
  );
}

// ===== DASHBOARD =====
function DashboardPage() {
  const { token } = useToken();
  const [stats, setStats] = useState(null);
  const [extended, setExtended] = useState(null);
  const [pageError, setPageError] = useState(null);

  useEffect(() => {
    apiFetch(token, `${API}/dashboard`).then(setStats).catch(e => setPageError(formatPageError(e)));
    apiFetch(token, `${API}/dashboard/extended`).then(setExtended).catch(e => setPageError(formatPageError(e)));
  }, [token]);

  if (!stats) {
    return (
      <div className="admin-page">
        <div className="page-header"><h1 className="page-title">Дашборд</h1><p className="page-subtitle">Загрузка…</p></div>
        <div className="admin-page-scroll"><PageErrorBanner message={pageError} /></div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header"><h1 className="page-title">Дашборд</h1><p className="page-subtitle">Обзор системы MT-Банк</p></div>
      <div className="admin-page-scroll">
        <PageErrorBanner message={pageError} />
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Пользователи</div><div className="stat-value">{stats.totalUsers}</div></div>
          <div className="stat-card"><div className="stat-label">Карт в обороте</div><div className="stat-value">{stats.totalCards}</div></div>
          <div className="stat-card"><div className="stat-label">MB баллов</div><div className="stat-value" style={{ color: 'var(--primary)' }}>{stats.totalMBInCirculation?.toLocaleString()}</div></div>
          <div className="stat-card"><div className="stat-label">Транзакций</div><div className="stat-value">{stats.totalTransactions}</div></div>
          {extended && <div className="stat-card"><div className="stat-label">Общий баланс</div><div className="stat-value" style={{ color: 'var(--success)' }}>₽ {extended.totalBalance?.toLocaleString('ru-RU')}</div></div>}
        </div>
        {extended && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 32 }}>
            <div className="table-container">
              <div className="table-header"><span className="table-title">Последние операции</span></div>
              <table>
                <thead><tr><th>Пользователь</th><th>Тип</th><th>Сумма</th></tr></thead>
                <tbody>
                  {extended.recentTransactions.slice(0, 5).map(t => (
                    <tr key={t.id}>
                      <td><div style={{ fontWeight: 700 }}>{t.user?.name}</div><div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{t.merchant}</div></td>
                      <td><span className="badge badge-standard">{t.type}</span></td>
                      <td style={{ fontWeight: 700, color: (t.type === 'TRANSFER_IN' || t.type === 'TOPUP') ? 'var(--success)' : 'inherit' }}>
                        {(t.type === 'TRANSFER_IN' || t.type === 'TOPUP') ? '+' : '-'}{t.amount} ₽
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-container">
              <div className="table-header"><span className="table-title">Редкость карт</span></div>
              <table>
                <thead><tr><th>Редкость</th><th>Количество</th><th>Доля</th></tr></thead>
                <tbody>
                  {Object.entries(stats.rarityDistribution || {}).map(([rarity, count]) => (
                    <tr key={rarity}>
                      <td><span className={`badge badge-${rarity.toLowerCase()}`}>{rarity}</span></td>
                      <td>{count}</td>
                      <td>{stats.totalCards > 0 ? Math.round((count / stats.totalCards) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== CARDS =====
const cardCreateAdminSchema = z.object({
  name: nameSchema,
  brandName: z.string().min(1, 'Поле обязательно'),
  brandIcon: z.string().default('style'),
  rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']),
  cashbackPercent: z.coerce.number().min(0),
  mbValue: z.coerce.number().min(0),
  maxHealth: z.coerce.number().min(0),
  dropRate: z.coerce.number().min(0).max(1).default(0.1),
  description: z.string().optional().default(''),
});

function CardsPage() {
  const { token } = useToken();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const cardForm = useZodForm(cardCreateAdminSchema, {
    name: '', brandName: '', brandIcon: 'style', rarity: 'COMMON',
    cashbackPercent: 1.0, mbValue: 10, maxHealth: 100, dropRate: 0.1, description: '',
  });

  const load = () => {
    setLoading(true);
    apiFetch(token, `${API}/cards`)
      .then(setCards)
      .catch(e => { setPageError(formatPageError(e)); toastErrorFromAppError(e, 'Не удалось загрузить карты'); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [token]);

  const handleCreate = cardForm.submit(async (data) => {
    setIsCreating(true);
    try {
      await apiFetch(token, `${API}/cards`, { method: 'POST', body: data });
      setShowCreate(false);
      cardForm.reset({ name: '', brandName: '', brandIcon: 'style', rarity: 'COMMON', cashbackPercent: 1.0, mbValue: 10, maxHealth: 100, dropRate: 0.1, description: '' });
      toastSuccess('Сохранение выполнено');
      load();
    } catch (err) {
      setPageError(formatPageError(err));
      toastErrorFromAppError(err, 'Не удалось создать карту');
    } finally {
      setIsCreating(false);
    }
  });

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await apiFetch(token, `${API}/cards/${confirmDelete.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      toastSuccess('Удаление выполнено');
      load();
    } catch (err) {
      setPageError(formatPageError(err));
      toastErrorFromAppError(err, 'Не удалось удалить карту');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div><h1 className="page-title">Шаблоны карт</h1><p className="page-subtitle">Управление коллекционными картами</p></div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>add</span> Создать карту
          </button>
        </div>
        <div className="admin-page-scroll">
          <PageErrorBanner message={pageError} />
          <div className="table-container">
            <table>
              <thead><tr><th>Имя</th><th>Бренд</th><th>Редкость</th><th>Кэшбэк</th><th>MB</th><th>HP</th><th>Drop%</th><th>Статус</th><th>Действия</th></tr></thead>
              <tbody>
                {loading && cards.length === 0 ? (
                  <SkeletonRow columns={9} rows={5} />
                ) : cards.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>{c.name}</td>
                    <td>{c.brandName}</td>
                    <td><span className={`badge badge-${c.rarity.toLowerCase()}`}>{c.rarity}</span></td>
                    <td>{c.cashbackPercent}%</td>
                    <td>{c.mbValue}</td>
                    <td>{c.maxHealth}</td>
                    <td>{((c.dropRate ?? 0) * 100).toFixed(1)}%</td>
                    <td>{c.isActive ? <span style={{ color: 'var(--success)' }}>●</span> : <span style={{ color: 'var(--error)' }}>●</span>}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete({ id: c.id, name: c.name })}>Удалить</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleCreate}>
            <h2 className="modal-title">Новая карта</h2>
            <div className="form-group">
              <label className="form-label">Название</label>
              <input className="form-input" value={cardForm.values.name} onChange={e => cardForm.setField('name', e.target.value)} onBlur={() => cardForm.blurField('name')} />
              {cardForm.errors.name && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.name}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Бренд</label>
              <input className="form-input" value={cardForm.values.brandName} onChange={e => cardForm.setField('brandName', e.target.value)} onBlur={() => cardForm.blurField('brandName')} />
              {cardForm.errors.brandName && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.brandName}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Иконка (Material Icon)</label>
              <input className="form-input" value={cardForm.values.brandIcon} onChange={e => cardForm.setField('brandIcon', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Редкость</label>
              <select className="form-select" value={cardForm.values.rarity} onChange={e => cardForm.setField('rarity', e.target.value)}>
                <option value="COMMON">Common</option><option value="RARE">Rare</option><option value="EPIC">Epic</option><option value="LEGENDARY">Legendary</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Кэшбэк %</label>
                <input className="form-input" type="number" step="0.1" value={cardForm.values.cashbackPercent} onChange={e => cardForm.setField('cashbackPercent', e.target.value)} onBlur={() => cardForm.blurField('cashbackPercent')} />
                {cardForm.errors.cashbackPercent && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.cashbackPercent}</small>}
              </div>
              <div className="form-group">
                <label className="form-label">MB</label>
                <input className="form-input" type="number" value={cardForm.values.mbValue} onChange={e => cardForm.setField('mbValue', e.target.value)} onBlur={() => cardForm.blurField('mbValue')} />
                {cardForm.errors.mbValue && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.mbValue}</small>}
              </div>
              <div className="form-group">
                <label className="form-label">Макс. HP</label>
                <input className="form-input" type="number" value={cardForm.values.maxHealth} onChange={e => cardForm.setField('maxHealth', e.target.value)} onBlur={() => cardForm.blurField('maxHealth')} />
                {cardForm.errors.maxHealth && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.maxHealth}</small>}
              </div>
              <div className="form-group">
                <label className="form-label">Drop Rate (0–1)</label>
                <input className="form-input" type="number" step="0.01" min="0" max="1" value={cardForm.values.dropRate} onChange={e => cardForm.setField('dropRate', e.target.value)} onBlur={() => cardForm.blurField('dropRate')} />
                {cardForm.errors.dropRate && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.dropRate}</small>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Описание</label>
              <input className="form-input" value={cardForm.values.description} onChange={e => cardForm.setField('description', e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Отмена</button>
              <SpinnerButton type="submit" loading={isCreating} className="btn btn-primary">Создать</SpinnerButton>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Деактивировать карту?"
        message={confirmDelete ? `Карта «${confirmDelete.name}» будет деактивирована.` : ''}
        confirmLabel={isDeleting ? 'Выполняется…' : 'Удалить'}
        onConfirm={handleDelete}
        onCancel={() => (isDeleting ? null : setConfirmDelete(null))}
      />
    </>
  );
}

// ===== SIMULATE TRANSACTION =====
function SimulatePage() {
  const { token } = useToken();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ userId: '', accountId: '', amount: 500, type: 'PURCHASE', category: 'Покупки', merchant: 'Тестовый магазин' });
  const [accounts, setAccounts] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState(null);

  useEffect(() => {
    apiFetch(token, `${API}/users`).then(data => setUsers(data.users ?? [])).catch(e => setPageError(formatPageError(e)));
  }, [token]);

  const loadAccounts = async (userId) => {
    setForm(f => ({ ...f, userId, accountId: '' }));
    setAccounts([]);
    if (!userId) return;
    try {
      const data = await apiFetch(token, `${API}/users/${userId}/accounts`);
      setAccounts(data);
      if (data.length > 0) setForm(f => ({ ...f, accountId: data[0].id }));
    } catch (e) {
      setAccounts([]);
      setPageError(formatPageError(e));
    }
  };

  const handleSimulate = async (e) => {
    e.preventDefault();
    if (!form.userId) { setPageError('Выберите пользователя'); return; }
    setLoading(true);
    setResult(null);
    try {
      const body = { userId: form.userId, amount: parseFloat(form.amount), category: form.category, merchant: form.merchant, type: form.type };
      if (form.accountId) body.accountId = form.accountId;
      const data = await apiFetch(token, `${API}/simulate-transaction`, { method: 'POST', body });
      setResult(data);
    } catch (err) {
      setPageError(formatPageError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1 className="page-title">Симуляция транзакций</h1>
        <p className="page-subtitle">Создайте тестовую транзакцию для проверки дропа карт</p>
      </div>
      <div className="admin-page-scroll">
        <PageErrorBanner message={pageError} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div className="table-container" style={{ padding: 32 }}>
            <h3 style={{ marginBottom: 24, fontWeight: 700 }}>Параметры</h3>
            <form onSubmit={handleSimulate}>
              <div className="form-group"><label className="form-label">Пользователь</label>
                <select className="form-select" value={form.userId} onChange={e => loadAccounts(e.target.value)} required>
                  <option value="">Выберите...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.phone})</option>)}
                </select>
              </div>
              {accounts.length > 0 && (
                <div className="form-group"><label className="form-label">Счёт</label>
                  <select className="form-select" value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.balance?.toLocaleString('ru-RU')} {a.currency || '₽'}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group"><label className="form-label">Тип</label>
                <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="PURCHASE">Покупка</option>
                  <option value="TRANSFER_IN">Входящий перевод</option>
                  <option value="TOPUP">Пополнение</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Сумма ₽</label><input className="form-input" type="number" min="1" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
              <div className="form-group"><label className="form-label">Категория</label>
                <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option>Покупки</option><option>Кафе и Рестораны</option><option>Транспорт</option><option>Развлечения</option><option>Сервисы</option><option>Перевод</option><option>Пополнение</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Мерчант</label><input className="form-input" value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} /></div>
              <SpinnerButton type="submit" loading={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                <span className="material-icons-outlined" style={{ fontSize: 18 }}>play_arrow</span> Выполнить
              </SpinnerButton>
            </form>
          </div>
          <div className="table-container" style={{ padding: 32 }}>
            <h3 style={{ marginBottom: 24, fontWeight: 700 }}>Результат</h3>
            {result ? (
              <div>
                <div style={{ background: 'rgba(34,197,94,0.08)', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                  <p style={{ fontWeight: 700, color: 'var(--success)' }}>✓ Транзакция создана</p>
                  <p style={{ fontSize: 13, marginTop: 4 }}>Тип: {result.transaction?.type || form.type}</p>
                  <p style={{ fontSize: 13 }}>Сумма: ₽ {result.transaction?.amount?.toLocaleString('ru-RU')}</p>
                  <p style={{ fontSize: 13 }}>Новый баланс: ₽ {result.account?.balance?.toLocaleString('ru-RU')}</p>
                </div>
                {result.droppedCard && (
                  <div style={{ background: 'rgba(79,142,247,0.08)', padding: 16, borderRadius: 12 }}>
                    <p style={{ fontWeight: 700, color: 'var(--primary)' }}>🎴 Выпала карта!</p>
                    <p style={{ fontSize: 13, marginTop: 4 }}>{result.droppedCard.collectionCard?.name}</p>
                    <p style={{ fontSize: 13 }}>Редкость: {result.droppedCard.collectionCard?.rarity}</p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--on-surface-variant)' }}>
                <span className="material-icons-outlined" style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>receipt_long</span>
                <p>Результат появится здесь</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== ACCOUNTS =====
function AccountsPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [q, setQ] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [frozenFilter, setFrozenFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [mutatingId, setMutatingId] = useState(null);
  const [confirmFreeze, setConfirmFreeze] = useState(null);
  const [adjustFor, setAdjustFor] = useState(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustErr, setAdjustErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) params.set('q', q);
      if (userIdFilter) params.set('userId', userIdFilter);
      if (frozenFilter) params.set('frozen', frozenFilter);
      apiFetch(token, `${API}/accounts?${params.toString()}`)
        .then(r => { if (!cancelled) { setItems(Array.isArray(r.items) ? r.items : []); setTotal(typeof r.total === 'number' ? r.total : 0); } })
        .catch(e => { if (!cancelled) setErr(e); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [token, page, q, userIdFilter, frozenFilter]);

  const doFreeze = async () => {
    if (!confirmFreeze) return;
    const { acc, action } = confirmFreeze;
    setMutatingId(acc.id);
    try {
      await apiFetch(token, `${API}/accounts/${acc.id}/${action}`, { method: 'POST', body: {} });
      toastSuccess(action === 'freeze' ? 'Счёт заморожен' : 'Счёт разморожен');
      setConfirmFreeze(null);
      setItems(prev => prev.map(a => a.id === acc.id ? { ...a, frozen: action === 'freeze' } : a));
    } catch (e) {
      toastErrorFromAppError(e, 'Не удалось обновить счёт');
    } finally {
      setMutatingId(null);
    }
  };

  const doAdjust = async (e) => {
    e?.preventDefault?.();
    if (!adjustFor) return;
    setAdjustErr('');
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta)) { setAdjustErr('Введите число'); return; }
    if (!adjustReason || adjustReason.length < 3) { setAdjustErr('Укажите причину (минимум 3 символа)'); return; }
    setMutatingId(adjustFor.id);
    try {
      const updated = await apiFetch(token, `${API}/accounts/${adjustFor.id}/balance-adjust`, { method: 'POST', body: { delta, reason: adjustReason } });
      toastSuccess('Баланс обновлён');
      setItems(prev => prev.map(a => a.id === adjustFor.id ? { ...a, balance: updated.balance } : a));
      setAdjustFor(null); setAdjustDelta(''); setAdjustReason('');
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось скорректировать баланс');
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ flexShrink: 0 }}>
          <h1 className="page-title">Счета</h1>
          <p className="page-subtitle">Заморозка и корректировка балансов</p>
        </div>
        <div className="admin-page-scroll">
          {err && <PageErrorBanner message="Не удалось загрузить счета." />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="search" className="form-input" placeholder="Поиск" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 220 }} />
            <input type="text" className="form-input" placeholder="ID пользователя" value={userIdFilter} onChange={e => { setUserIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 220 }} />
            <select className="form-select" value={frozenFilter} onChange={e => { setFrozenFilter(e.target.value); setPage(1); }} style={{ maxWidth: 180 }}>
              <option value="">Все</option><option value="true">Заморожен</option><option value="false">Активен</option>
            </select>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>ID</th><th>Пользователь</th><th>Тип</th><th>Баланс</th><th>Статус</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? <SkeletonRow columns={6} rows={5} /> : items.length === 0 && !err ? (
                  <tr><td colSpan={6}><EmptyState heading="Счетов не найдено" body="Измените фильтры." icon="search_off" /></td></tr>
                ) : items.map(a => (
                  <tr key={a.id} style={mutatingId === a.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.id.slice(-8)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.userId.slice(-8)}</td>
                    <td>{a.type}</td>
                    <td style={{ fontWeight: 700 }}>₽ {Number(a.balance).toLocaleString('ru-RU')}</td>
                    <td>{a.frozen ? <span className="badge" style={{ color: 'var(--error)' }}>Заморожен</span> : <span className="badge" style={{ color: 'var(--success)' }}>Активен</span>}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      {a.frozen
                        ? <button className="btn btn-sm" onClick={() => setConfirmFreeze({ acc: a, action: 'unfreeze' })}>Разморозить</button>
                        : <button className="btn btn-sm btn-danger" onClick={() => setConfirmFreeze({ acc: a, action: 'freeze' })}>Заморозить</button>}
                      <button className="btn btn-sm" onClick={() => { setAdjustFor(a); setAdjustDelta(''); setAdjustReason(''); setAdjustErr(''); }}>Скорректировать</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Назад</button>
            <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmFreeze}
        title={confirmFreeze?.action === 'freeze' ? 'Заморозить счёт?' : 'Разморозить счёт?'}
        message={confirmFreeze?.action === 'freeze' ? `Счёт ${confirmFreeze?.acc?.id?.slice(-8)} будет заморожен.` : 'Счёт будет разморожен.'}
        confirmLabel={confirmFreeze?.action === 'freeze' ? 'Заморозить' : 'Разморозить'}
        cancelLabel="Отмена"
        destructive={confirmFreeze?.action === 'freeze'}
        onConfirm={doFreeze}
        onCancel={() => setConfirmFreeze(null)}
      />

      {adjustFor && (
        <div className="modal-overlay" onClick={() => setAdjustFor(null)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={doAdjust}>
            <h2 className="modal-title">Скорректировать баланс</h2>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginBottom: 16 }}>Текущий баланс: ₽ {Number(adjustFor.balance).toLocaleString('ru-RU')}</p>
            <div className="form-group">
              <label className="form-label">Изменение (delta)</label>
              <input className="form-input" type="number" step="0.01" autoFocus value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Причина</label>
              <input className="form-input" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
            </div>
            {adjustErr && <p style={{ color: 'var(--error)', fontSize: 12 }}>{adjustErr}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setAdjustFor(null)}>Отмена</button>
              <SpinnerButton type="submit" loading={mutatingId === adjustFor.id} className="btn btn-primary">Сохранить</SpinnerButton>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ===== TRANSACTIONS =====
function TransactionsPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [q, setQ] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [accountIdFilter, setAccountIdFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [confirmReverse, setConfirmReverse] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [mutatingId, setMutatingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) params.set('q', q);
      if (userIdFilter) params.set('userId', userIdFilter);
      if (accountIdFilter) params.set('accountId', accountIdFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      apiFetch(token, `${API}/transactions?${params.toString()}`)
        .then(r => { if (!cancelled) { setItems(Array.isArray(r.items) ? r.items : []); setTotal(typeof r.total === 'number' ? r.total : 0); } })
        .catch(e => { if (!cancelled) setErr(e); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [token, page, q, userIdFilter, accountIdFilter, typeFilter, statusFilter, fromDate, toDate]);

  const doReverse = async () => {
    if (!confirmReverse || !reverseReason || reverseReason.length < 3) return;
    setMutatingId(confirmReverse.id);
    try {
      await apiFetch(token, `${API}/transactions/${confirmReverse.id}/reverse`, { method: 'POST', body: { reason: reverseReason } });
      toastSuccess('Операция отменена');
      setConfirmReverse(null); setReverseReason('');
      setPage(1);
    } catch (e) {
      if (e?.code === 'TRANSACTION_ALREADY_REVERSED') {
        useAdminToast.getState().push({ type: 'error', message: 'Операция уже была отменена' });
      } else {
        toastErrorFromAppError(e, 'Не удалось отменить операцию');
      }
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ flexShrink: 0 }}>
          <h1 className="page-title">Операции</h1>
          <p className="page-subtitle">Поиск и отмена транзакций</p>
        </div>
        <div className="admin-page-scroll">
          {err && <PageErrorBanner message="Не удалось загрузить операции." />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="search" className="form-input" placeholder="Поиск" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} />
            <input type="text" className="form-input" placeholder="ID пользователя" value={userIdFilter} onChange={e => { setUserIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} />
            <input type="text" className="form-input" placeholder="ID счёта" value={accountIdFilter} onChange={e => { setAccountIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} />
            <select className="form-select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} style={{ maxWidth: 170 }}>
              <option value="">Все типы</option>
              <option value="PURCHASE">Покупка</option>
              <option value="TRANSFER_OUT">Перевод исх.</option>
              <option value="TRANSFER_IN">Перевод вх.</option>
              <option value="TOPUP">Пополнение</option>
              <option value="PAYMENT">Платёж</option>
            </select>
            <select className="form-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ maxWidth: 170 }}>
              <option value="">Все статусы</option>
              <option value="completed">Завершено</option>
              <option value="pending">В обработке</option>
              <option value="scheduled">Запланировано</option>
              <option value="reversed">Отменено</option>
            </select>
            <input type="date" className="form-input" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
            <input type="date" className="form-input" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>ID</th><th>Пользователь</th><th>Тип</th><th>Сумма</th><th>Статус</th><th>Дата</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? <SkeletonRow columns={7} rows={8} /> : items.length === 0 && !err ? (
                  <tr><td colSpan={7}><EmptyState heading="Операции не найдены" body="Измените фильтры." icon="search_off" /></td></tr>
                ) : items.map(t => (
                  <tr key={t.id} style={mutatingId === t.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{t.id.slice(-8)}</td>
                    <td style={{ fontSize: 12 }}>{t.user?.name ?? t.userId?.slice(-8)}</td>
                    <td><span className="badge badge-standard">{t.type}</span></td>
                    <td style={{ fontWeight: 700, color: (t.type === 'TRANSFER_IN' || t.type === 'TOPUP') ? 'var(--success)' : 'inherit' }}>
                      {(t.type === 'TRANSFER_IN' || t.type === 'TOPUP') ? '+' : '-'}₽{Number(t.amount).toLocaleString('ru-RU')}
                    </td>
                    <td><span className={`badge badge-${(t.status || 'unknown').toLowerCase()}`}>{t.status}</span></td>
                    <td style={{ fontSize: 12 }}>{t.createdAt ? new Date(t.createdAt).toLocaleString('ru-RU') : '—'}</td>
                    <td>
                      {t.status !== 'reversed' && (
                        <button className="btn btn-sm btn-danger" onClick={() => { setConfirmReverse(t); setReverseReason(''); }}>Отменить</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Назад</button>
            <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
          </div>
        </div>
      </div>

      {confirmReverse && (
        <div className="modal-overlay" onClick={() => setConfirmReverse(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Отменить операцию?</h2>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginBottom: 16 }}>
              Транзакция на ₽{Number(confirmReverse.amount).toLocaleString('ru-RU')} будет отменена.
            </p>
            <div className="form-group">
              <label className="form-label">Причина отмены</label>
              <input className="form-input" autoFocus value={reverseReason} onChange={e => setReverseReason(e.target.value)} placeholder="Минимум 3 символа" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setConfirmReverse(null)}>Отмена</button>
              <SpinnerButton
                className="btn btn-danger"
                loading={mutatingId === confirmReverse.id}
                onClick={doReverse}
                disabled={reverseReason.length < 3}
              >
                Подтвердить
              </SpinnerButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ===== AUDIT =====
function AuditPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) params.set('q', q);
      apiFetch(token, `${API}/audit?${params.toString()}`)
        .then(r => { if (!cancelled) { setItems(Array.isArray(r.items) ? r.items : []); setTotal(typeof r.total === 'number' ? r.total : 0); } })
        .catch(e => { if (!cancelled) setErr(e); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [token, page, q]);

  return (
    <div className="admin-page">
      <div className="page-header" style={{ flexShrink: 0 }}>
        <h1 className="page-title">Аудит</h1>
        <p className="page-subtitle">Журнал действий администраторов</p>
      </div>
      <div className="admin-page-scroll">
        {err && <PageErrorBanner message="Не удалось загрузить журнал аудита." />}
        <div style={{ marginBottom: 16 }}>
          <input type="search" className="form-input" placeholder="Поиск по действию или пользователю" value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 340 }} />
        </div>
        <div className="table-container">
          <table>
            <thead><tr><th>Действие</th><th>Администратор</th><th>Цель</th><th>Дата</th></tr></thead>
            <tbody>
              {loading ? <SkeletonRow columns={4} rows={8} /> : items.length === 0 && !err ? (
                <tr><td colSpan={4}><EmptyState heading="Записей нет" body="Журнал аудита пуст." icon="manage_search" /></td></tr>
              ) : items.map(entry => (
                <tr key={entry.id}>
                  <td>
                    <span className={`badge${actionIsDestructive(entry.action) ? ' badge-danger' : ''}`}>
                      {actionToRussianLabel(entry.action)}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{entry.admin?.name ?? entry.adminId?.slice(-8)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.targetId?.slice(-8) ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{entry.createdAt ? new Date(entry.createdAt).toLocaleString('ru-RU') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
          <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Назад</button>
          <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
        </div>
      </div>
    </div>
  );
}
