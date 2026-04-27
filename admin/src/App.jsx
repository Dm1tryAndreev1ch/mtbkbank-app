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

  const onSubmit = submit(async ({ phone, pin }) => {
    setError('');
    setIsSubmitting(true);
    try {
      const res = await fetch(withApiBase('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = parseJsonBody(text);
      } catch {
        const hint = text.trimStart().startsWith('<')
          ? 'Ответ похож на HTML (часто прокси Vite). Убедитесь, что в admin/.env.development задан VITE_API_ORIGIN и backend запущен.'
          : 'Ответ не JSON. Запустите backend (порт из VITE_API_ORIGIN, обычно 3000).';
        setError(hint);
        return;
      }
      if (!res.ok) {
        setError(data.error || `Ошибка входа (${res.status})`);
        return;
      }
      if (data.accessToken && data.user?.isAdmin) {
        setToken(data.accessToken);
        onLogin(data.user);
      } else if (data.accessToken && !data.user?.isAdmin) {
        setError('Этот аккаунт не является администратором');
      } else {
        setError(data.error || 'Ошибка входа');
      }
    } catch (err) {
      setError('Нет соединения с API. Запустите backend (`npm run dev` в папке backend) и откройте админку через `npm run dev` в папке admin.');
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <form onSubmit={onSubmit} style={{ width: 360, background: 'var(--surface-card)', padding: 40, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>MT-Банк</h1>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', letterSpacing: 3, marginBottom: 32 }}>ПАНЕЛЬ АДМИНИСТРАТОРА</p>
        {error && <div style={{ background: 'rgba(186,26,26,0.08)', color: 'var(--error)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}
        <div className="form-group">
          <label className="form-label">Телефон</label>
          <input
            className="form-input"
            value={values.phone}
            onChange={e => setField('phone', e.target.value)}
            onBlur={() => blurField('phone')}
            placeholder="+7XXXXXXXXXX"
          />
          {errors.phone && <small className="admin-error" style={{ color: 'var(--error)', display: 'block', marginTop: 4 }}>{errors.phone}</small>}
        </div>
        <div className="form-group">
          <label className="form-label">ПИН-код</label>
          <input
            className="form-input"
            type="password"
            maxLength={4}
            value={values.pin}
            onChange={e => setField('pin', e.target.value)}
            onBlur={() => blurField('pin')}
            placeholder="****"
          />
          {errors.pin && <small className="admin-error" style={{ color: 'var(--error)', display: 'block', marginTop: 4 }}>{errors.pin}</small>}
        </div>
        <SpinnerButton
          loading={isSubmitting}
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
        >
          Войти
        </SpinnerButton>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--on-surface-variant)' }}>Войдите с учётными данными администратора</p>
      </form>
    </div>
  );
}

// ===== DASHBOARD =====
function PageErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        padding: '12px 16px',
        background: 'var(--error-container, #fde2e2)',
        color: 'var(--on-error-container, #5a1a1a)',
        borderRadius: 8,
        marginBottom: 12,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  );
}

function formatPageError(e) {
  // SEC-07: AppError → codebook. Raw backend strings never reach JSX.
  if (e && e.name === 'AppError') {
    const base = lookupErrorMessage(e.code);
    if (e.code === 'VALIDATION_FAILED' && Array.isArray(e.issues) && e.issues.length) {
      const fields = e.issues
        .slice(0, 5)
        .map((i) => (Array.isArray(i.path) ? i.path.join('.') : String(i.path || 'field')))
        .join(', ');
      return `${base}: ${fields}`.slice(0, 240);
    }
    return base;
  }
  // Network / JSON-parse / unknown — never echo raw message into JSX.
  try {
    // eslint-disable-next-line no-console
    console.warn('[admin] non-AppError surfaced to UI', e);
  } catch { /* noop */ }
  return 'Нет соединения с сервером. Проверьте, что backend запущен.';
}

function DashboardPage() {
  const { token } = useToken();
  const [stats, setStats] = useState(null);
  const [extended, setExtended] = useState(null);
  const [pageError, setPageError] = useState(null);

  useEffect(() => {
    apiFetch(token, `${API}/dashboard`).then(setStats).catch((e) => setPageError(formatPageError(e)));
    apiFetch(token, `${API}/dashboard/extended`).then(setExtended).catch((e) => setPageError(formatPageError(e)));
  }, [token]);

  if (!stats) {
    return (
      <div className="admin-page">
        <div className="page-header">
          <h1 className="page-title">Дашборд</h1>
          <p className="page-subtitle">Загрузка данных…</p>
        </div>
        <div className="admin-page-scroll">
          <PageErrorBanner message={pageError} />
          <p style={{ padding: 8, color: 'var(--on-surface-variant)' }}>Загрузка…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1 className="page-title">Дашборд</h1>
        <p className="page-subtitle">Обзор системы MT-Банк</p>
      </div>
      <div className="admin-page-scroll">
        <PageErrorBanner message={pageError} />
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Пользователи</div><div className="stat-value">{stats.totalUsers}</div></div>
          <div className="stat-card"><div className="stat-label">Карт в обороте</div><div className="stat-value">{stats.totalCards}</div></div>
          <div className="stat-card"><div className="stat-label">MB баллов</div><div className="stat-value" style={{ color: 'var(--primary)' }}>{stats.totalMBInCirculation?.toLocaleString()}</div></div>
          <div className="stat-card"><div className="stat-label">Транзакций</div><div className="stat-value">{stats.totalTransactions}</div></div>
          {extended && <div className="stat-card"><div className="stat-label">Общий баланс</div><div className="stat-value" style={{ color: 'var(--success)' }}>₽ {extended.totalBalance?.toLocaleString('ru-RU')}</div></div>}
        </div>

        {import.meta.env.DEV && (
          <button
            onClick={() => {
              const err = new Error('Phase-1 Sentry test (admin)');
              const eventId = Sentry.captureException(err);
              const sentryWired = Boolean(import.meta.env.VITE_SENTRY_DSN);
              const msg = sentryWired
                ? `Тестовая ошибка отправлена в Sentry (event ${eventId})`
                : 'Sentry DSN не настроен (VITE_SENTRY_DSN пуст). Ошибка будет брошена в консоль.';
              setPageError(msg);
              console.log('[sentry-test-button]', { eventId, sentryWired });
              // Throw asynchronously so the error escapes React's render-time
              // catch and reaches window.onerror + Sentry's global handler +
              // any ErrorBoundary wrapping the admin tree.
              setTimeout(() => { throw err; }, 0);
            }}
            style={{ marginTop: 12, padding: '6px 12px', borderColor: '#a00', color: '#a00', background: 'transparent' }}
            data-testid="sentry-test-button"
          >
            Throw test error (DEV)
          </button>
        )}

        {extended && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 32, marginBottom: 16 }}>
            <div className="table-container">
              <div className="table-header"><span className="table-title">Последние операции</span></div>
              <table>
                <thead><tr><th>Пользователь</th><th>Тип</th><th>Сумма</th></tr></thead>
                <tbody>
                  {extended.recentTransactions.slice(0, 5).map(t => (
                    <tr key={t.id}>
                      <td><div style={{fontWeight: 700}}>{t.user?.name}</div><div style={{fontSize: 12, color: 'var(--on-surface-variant)'}}>{t.merchant}</div></td>
                      <td><span className={`badge badge-standard`}>{t.type}</span></td>
                      <td style={{ fontWeight: 700, color: t.type === 'TRANSFER_IN' || t.type === 'TOPUP' ? 'var(--success)' : 'inherit' }}>
                        {t.type === 'TRANSFER_IN' || t.type === 'TOPUP' ? '+' : '-'} {t.amount} ₽
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-container">
              <div className="table-header"><span className="table-title">Распределение по редкости карт</span></div>
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

// ===== USERS =====
// A-M1/A-M3 — admin-local schema for create-user form (z.coerce.number guards mbPoints).
// Uses re-exported phone/pin/name from backend (D-15) so the rules cannot drift.
const userCreateAdminSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  pin: pinSchema,
  mbPoints: z.coerce.number().min(0).default(0),
  status: z.enum(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM', 'BLOCKED']).default('STANDARD'),
});
const userEditAdminSchema = z.object({
  name: nameSchema,
  mbPoints: z.coerce.number().min(0),
  status: z.enum(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM', 'BLOCKED']),
});

function UsersPage() {
  const { token } = useToken();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // A-M1/A-M3 — Zod forms.
  const editForm = useZodForm(userEditAdminSchema, { name: '', mbPoints: 0, status: 'STANDARD' });
  const createForm = useZodForm(userCreateAdminSchema, {
    name: '', phone: '', pin: '', mbPoints: 0, status: 'STANDARD',
  });

  // FIX: API returns { users, total, limit, offset } — extract .users array
  const load = () => {
    setLoading(true);
    apiFetch(token, `${API}/users`)
      .then(data => setUsers(data.users ?? []))
      .catch((e) => { setPageError(formatPageError(e)); toastErrorFromAppError(e, 'Не удалось загрузить пользователей'); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [token]);

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
                      <button className="btn btn-sm btn-primary" onClick={() => {
                        setEditing(u.id);
                        editForm.reset({ name: u.name, mbPoints: u.mbPoints ?? 0, status: u.status || 'STANDARD' });
                      }}>
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <h2 className="modal-title">Новый пользователь</h2>
            <div className="form-group">
              <label className="form-label">Имя</label>
              <input
                className="form-input"
                value={createForm.values.name}
                onChange={e => createForm.setField('name', e.target.value)}
                onBlur={() => createForm.blurField('name')}
              />
              {createForm.errors.name && <small className="admin-error" style={{ color: 'var(--error)' }}>{createForm.errors.name}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Телефон</label>
              <input
                className="form-input"
                value={createForm.values.phone}
                onChange={e => createForm.setField('phone', e.target.value)}
                onBlur={() => createForm.blurField('phone')}
                placeholder="+79..."
              />
              {createForm.errors.phone && <small className="admin-error" style={{ color: 'var(--error)' }}>{createForm.errors.phone}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">ПИН-код</label>
              <input
                className="form-input"
                maxLength={4}
                value={createForm.values.pin}
                onChange={e => createForm.setField('pin', e.target.value)}
                onBlur={() => createForm.blurField('pin')}
              />
              {createForm.errors.pin && <small className="admin-error" style={{ color: 'var(--error)' }}>{createForm.errors.pin}</small>}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Отмена</button>
              <SpinnerButton type="submit" loading={isCreating} className="btn btn-primary">Создать</SpinnerButton>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ===== CARDS =====
// A-M3 — z.coerce.number() guards every numeric input; NaN can never reach the API.
const cardCreateAdminSchema = z.object({
  name: nameSchema,
  brandName: z.string().min(1, 'Поле обязательно'),
  brandIcon: z.string().default('style'),
  rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']),
  cashbackPercent: z.coerce.number().min(0),
  mbValue: z.coerce.number().min(0),
  maxHealth: z.coerce.number().min(0),
  description: z.string().optional().default(''),
});

function CardsPage() {
  const { token } = useToken();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name } | null
  const [isDeleting, setIsDeleting] = useState(false);

  const cardForm = useZodForm(cardCreateAdminSchema, {
    name: '', brandName: '', brandIcon: 'style', rarity: 'COMMON',
    cashbackPercent: 1.0, mbValue: 10, maxHealth: 100, description: '',
  });

  const load = () => {
    setLoading(true);
    apiFetch(token, `${API}/cards`)
      .then(setCards)
      .catch((e) => { setPageError(formatPageError(e)); toastErrorFromAppError(e, 'Не удалось загрузить карты'); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [token]);

  const handleCreate = cardForm.submit(async (data) => {
    setIsCreating(true);
    try {
      await apiFetch(token, `${API}/cards`, { method: 'POST', body: data });
      setShowCreate(false);
      cardForm.reset({
        name: '', brandName: '', brandIcon: 'style', rarity: 'COMMON',
        cashbackPercent: 1.0, mbValue: 10, maxHealth: 100, description: '',
      });
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
              <thead><tr><th>Имя</th><th>Бренд</th><th>Редкость</th><th>Кэшбэк</th><th>MB</th><th>Здоровье</th><th>Статус</th><th>Действия</th></tr></thead>
              <tbody>
                {/* A-M4 — skeleton rows while loading */}
                {loading && cards.length === 0 ? (
                  <SkeletonRow columns={8} rows={5} />
                ) : cards.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>{c.name}</td>
                    <td>{c.brandName}</td>
                    <td><span className={`badge badge-${c.rarity.toLowerCase()}`}>{c.rarity}</span></td>
                    <td style={{ fontWeight: 700 }}>{c.cashbackPercent}%</td>
                    <td>{c.mbValue}</td>
                    <td>{c.maxHealth}</td>
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
              <input className="form-input" value={cardForm.values.name}
                onChange={e => cardForm.setField('name', e.target.value)}
                onBlur={() => cardForm.blurField('name')} />
              {cardForm.errors.name && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.name}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Бренд</label>
              <input className="form-input" value={cardForm.values.brandName}
                onChange={e => cardForm.setField('brandName', e.target.value)}
                onBlur={() => cardForm.blurField('brandName')} />
              {cardForm.errors.brandName && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.brandName}</small>}
            </div>
            <div className="form-group"><label className="form-label">Иконка (Material Icon)</label>
              <input className="form-input" value={cardForm.values.brandIcon}
                onChange={e => cardForm.setField('brandIcon', e.target.value)} />
            </div>
            <div className="form-group"><label className="form-label">Редкость</label>
              <select className="form-select" value={cardForm.values.rarity}
                onChange={e => cardForm.setField('rarity', e.target.value)}>
                <option value="COMMON">Common</option><option value="RARE">Rare</option><option value="EPIC">Epic</option><option value="LEGENDARY">Legendary</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Кэшбэк %</label>
                <input className="form-input" type="number" step="0.1" value={cardForm.values.cashbackPercent}
                  onChange={e => cardForm.setField('cashbackPercent', e.target.value)}
                  onBlur={() => cardForm.blurField('cashbackPercent')} />
                {cardForm.errors.cashbackPercent && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.cashbackPercent}</small>}
              </div>
              <div className="form-group">
                <label className="form-label">MB Стоимость</label>
                <input className="form-input" type="number" value={cardForm.values.mbValue}
                  onChange={e => cardForm.setField('mbValue', e.target.value)}
                  onBlur={() => cardForm.blurField('mbValue')} />
                {cardForm.errors.mbValue && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.mbValue}</small>}
              </div>
              <div className="form-group">
                <label className="form-label">Макс. HP</label>
                <input className="form-input" type="number" value={cardForm.values.maxHealth}
                  onChange={e => cardForm.setField('maxHealth', e.target.value)}
                  onBlur={() => cardForm.blurField('maxHealth')} />
                {cardForm.errors.maxHealth && <small className="admin-error" style={{ color: 'var(--error)' }}>{cardForm.errors.maxHealth}</small>}
              </div>
            </div>
            <div className="form-group"><label className="form-label">Описание</label>
              <input className="form-input" value={cardForm.values.description}
                onChange={e => cardForm.setField('description', e.target.value)} />
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

  // FIX: API returns { users, total, limit, offset } — extract .users array
  useEffect(() => {
    apiFetch(token, `${API}/users`).then(data => setUsers(data.users ?? [])).catch((e) => setPageError(formatPageError(e)));
  }, [token]);

  const loadAccounts = async (userId) => {
    setForm(f => ({ ...f, userId, accountId: '' }));
    setAccounts([]);
    if (!userId) return;
    try {
      const data = await apiFetch(token, `${API}/users/${userId}/accounts`);
      setAccounts(data);
      if (data.length > 0) {
        setForm(f => ({ ...f, accountId: data[0].id }));
      }
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
      const body = {
        userId: form.userId,
        amount: parseFloat(form.amount),
        category: form.category,
        merchant: form.merchant,
        type: form.type,
      };
      if (form.accountId) body.accountId = form.accountId;
      const data = await apiFetch(token, `${API}/simulate-transaction`, {
        method: 'POST',
        body,
      });
      setResult(data);
    } catch (err) { setPageError(formatPageError(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1 className="page-title">Симуляция транзакций</h1>
        <p className="page-subtitle">Создайте тестовую транзакцию для проверки дропа карт и переводов</p>
      </div>
      <div className="admin-page-scroll">
        <PageErrorBanner message={pageError} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div className="table-container" style={{ padding: 32 }}>
          <h3 style={{ marginBottom: 24, fontWeight: 700 }}>Параметры транзакции</h3>
          <form onSubmit={handleSimulate}>
            <div className="form-group"><label className="form-label">Пользователь</label>
              <select className="form-select" value={form.userId} onChange={e => { loadAccounts(e.target.value); }} required>
                <option value="">Выберите...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.phone})</option>)}
              </select>
            </div>
            {accounts.length > 0 && (
              <div className="form-group"><label className="form-label">Счёт</label>
                <select className="form-select" value={form.accountId} onChange={e => setForm({...form, accountId: e.target.value})}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.balance?.toLocaleString('ru-RU')} {a.currency || '₽'}</option>)}
                </select>
              </div>
            )}
            <div className="form-group"><label className="form-label">Тип операции</label>
              <select className="form-select" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="PURCHASE">Покупка (списание)</option>
                <option value="TRANSFER_IN">Входящий перевод (зачисление)</option>
                <option value="TOPUP">Пополнение</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Сумма ₽</label><input className="form-input" type="number" min="1" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required /></div>
            <div className="form-group"><label className="form-label">Категория</label>
              <select className="form-select" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                <option>Покупки</option><option>Кафе и Рестораны</option><option>Транспорт</option><option>Развлечения</option><option>Сервисы</option><option>Перевод</option><option>Пополнение</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Мерчант / Описание</label><input className="form-input" value={form.merchant} onChange={e => setForm({...form, merchant: e.target.value})} /></div>
            {/* A-M2 — SpinnerButton owns disabled+spinner for the simulate mutation. */}
            <SpinnerButton
              type="submit"
              loading={loading}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <span className="material-icons-outlined" style={{ fontSize: 18 }}>play_arrow</span> Выполнить транзакцию
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

// ==================== ACCOUNTS PAGE ====================
// Phase 4.5 / 04.5-02 / ADMIN-01 — admin BankAccount page (freeze/unfreeze/balance-adjust).
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
        .then((r) => {
          if (cancelled) return;
          setItems(Array.isArray(r.items) ? r.items : []);
          setTotal(typeof r.total === 'number' ? r.total : 0);
        })
        .catch((e) => { if (!cancelled) setErr(e); })
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
      setItems((prev) => prev.map((a) => (a.id === acc.id ? { ...a, frozen: action === 'freeze' } : a)));
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
      const updated = await apiFetch(token, `${API}/accounts/${adjustFor.id}/balance-adjust`, {
        method: 'POST',
        body: { delta, reason: adjustReason },
      });
      toastSuccess('Баланс обновлён');
      setItems((prev) => prev.map((a) => (a.id === adjustFor.id ? { ...a, balance: updated.balance } : a)));
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
          {err && <PageErrorBanner message={'Не удалось загрузить счета. Попробуйте обновить страницу.'} />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="search" className="form-input" placeholder="Поиск" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 220 }} />
            <input type="text" className="form-input" placeholder="ID пользователя" value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 220 }} />
            <select className="form-select" value={frozenFilter}
              onChange={(e) => { setFrozenFilter(e.target.value); setPage(1); }} style={{ maxWidth: 180 }}>
              <option value="">Все</option>
              <option value="true">Заморожен</option>
              <option value="false">Активен</option>
            </select>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>ID</th><th>Пользователь</th><th>Тип</th><th>Баланс</th><th>Статус</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? (
                  <SkeletonRow columns={6} rows={5} />
                ) : items.length === 0 && !err ? (
                  <tr><td colSpan={6}>
                    <EmptyState heading="Счетов не найдено" body="Измените фильтры или поисковый запрос." icon="search_off" />
                  </td></tr>
                ) : items.map((a) => (
                  <tr key={a.id} style={mutatingId === a.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.id.slice(-8)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.userId.slice(-8)}</td>
                    <td>{a.type}</td>
                    <td style={{ fontWeight: 700 }}>₽ {Number(a.balance).toLocaleString('ru-RU')}</td>
                    <td>{a.frozen ? <span className="badge" style={{ color: 'var(--error)' }}>Заморожен</span> : <span className="badge" style={{ color: 'var(--success)' }}>Активен</span>}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      {a.frozen ? (
                        <button className="btn btn-sm" onClick={() => setConfirmFreeze({ acc: a, action: 'unfreeze' })}>Разморозить</button>
                      ) : (
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirmFreeze({ acc: a, action: 'freeze' })}>Заморозить</button>
                      )}
                      <button className="btn btn-sm" onClick={() => { setAdjustFor(a); setAdjustDelta(''); setAdjustReason(''); setAdjustErr(''); }}>Скорректировать баланс</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Назад</button>
            <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)}>Вперёд →</button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmFreeze}
        title={confirmFreeze?.action === 'freeze' ? 'Заморозить счёт?' : 'Разморозить счёт?'}
        message={
          confirmFreeze?.action === 'freeze'
            ? `Счёт ${confirmFreeze?.acc?.id?.slice(-8)} будет заморожен. Списания невозможны до разморозки.`
            : 'Счёт будет разморожен и снова доступен для списаний.'
        }
        confirmLabel={confirmFreeze?.action === 'freeze' ? 'Заморозить' : 'Разморозить'}
        cancelLabel="Отмена"
        destructive={confirmFreeze?.action === 'freeze'}
        onConfirm={doFreeze}
        onCancel={() => setConfirmFreeze(null)}
      />

      {adjustFor && (
        <div className="modal-overlay" onClick={() => setAdjustFor(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={doAdjust}>
            <h2 className="modal-title">Скорректировать баланс</h2>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginBottom: 16 }}>
              Текущий баланс: ₽ {Number(adjustFor.balance).toLocaleString('ru-RU')}
            </p>
            <div className="form-group">
              <label className="form-label">Изменение (delta)</label>
              <input className="form-input" type="number" step="0.01" autoFocus
                value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Причина</label>
              <input className="form-input" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
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

// ==================== TRANSACTIONS PAGE ====================
// Phase 4.5 / 04.5-02 / ADMIN-02 — admin Transaction page (paged search + reverse).
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
        .then((r) => {
          if (cancelled) return;
          setItems(Array.isArray(r.items) ? r.items : []);
          setTotal(typeof r.total === 'number' ? r.total : 0);
        })
        .catch((e) => { if (!cancelled) setErr(e); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [token, page, q, userIdFilter, accountIdFilter, typeFilter, statusFilter, fromDate, toDate]);

  const doReverse = async () => {
    if (!confirmReverse) return;
    if (!reverseReason || reverseReason.length < 3) return;
    setMutatingId(confirmReverse.id);
    try {
      await apiFetch(token, `${API}/transactions/${confirmReverse.id}/reverse`, {
        method: 'POST',
        body: { reason: reverseReason },
      });
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
          {err && <PageErrorBanner message={'Не удалось загрузить операции.'} />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="search" className="form-input" placeholder="Поиск" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} />
            <input type="text" className="form-input" placeholder="ID пользователя" value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} />
            <input type="text" className="form-input" placeholder="ID счёта" value={accountIdFilter}
              onChange={(e) => { setAccountIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} />
            <select className="form-select" value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} style={{ maxWidth: 170 }}>
              <option value="">Все типы</option>
              <option value="PURCHASE">Покупка</option>
              <option value="TRANSFER_OUT">Перевод исх.</option>
              <option value="TRANSFER_IN">Перевод вх.</option>
              <option value="TOPUP">Пополнение</option>
              <option value="PAYMENT">Платёж</option>
            </select>
            <select className="form-select" value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ maxWidth: 170 }}>
              <option value="">Все статусы</option>
              <option value="completed">Завершено</option>
              <option value="pending">В обработке</option>
              <option value="scheduled">Запланировано</option>
              <option value="failed">Ошибка</option>
              <option value="reversed">Отменена</option>
            </select>
            <input type="date" className="form-input" value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
            <input type="date" className="form-input" value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>ID</th><th>Дата</th><th>Тип</th><th>Сумма</th><th>Статус</th><th>Reverses</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? (
                  <SkeletonRow columns={7} rows={5} />
                ) : items.length === 0 && !err ? (
                  <tr><td colSpan={7}>
                    <EmptyState heading="Операций не найдено" body="Уточните период или фильтры." icon="search_off" />
                  </td></tr>
                ) : items.map((t) => (
                  <tr key={t.id} style={mutatingId === t.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.id.slice(-8)}</td>
                    <td>{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                    <td>{t.type}</td>
                    <td style={{ fontWeight: 700 }}>₽ {Number(t.amount).toLocaleString('ru-RU')}</td>
                    <td>{t.status}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{t.reversedById ? t.reversedById.slice(-8) : '—'}</td>
                    <td>
                      {t.status === 'completed' && !t.reversedById ? (
                        <button className="btn btn-sm btn-danger" onClick={() => { setConfirmReverse(t); setReverseReason(''); }}>Отменить операцию</button>
                      ) : (
                        <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Назад</button>
            <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)}>Вперёд →</button>
          </div>
        </div>
      </div>

      {confirmReverse && (
        <div className="modal-overlay" onClick={() => setConfirmReverse(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); doReverse(); }}>
            <h2 className="modal-title">Отменить операцию?</h2>
            <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 16 }}>
              Будет создана компенсирующая операция на сумму {Number(confirmReverse.amount).toLocaleString('ru-RU')} ₽. Действие необратимо.
            </p>
            <div className="form-group">
              <label className="form-label">Причина</label>
              <input className="form-input" autoFocus value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setConfirmReverse(null)}>Отмена</button>
              <SpinnerButton type="submit" loading={mutatingId === confirmReverse.id} className="btn btn-danger" disabled={!reverseReason || reverseReason.length < 3}>
                Отменить операцию
              </SpinnerButton>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ==================== PAYMENTS PAGE ====================
// Phase 4.5 / 04.5-02 / ADMIN-08 — payments are stored as Transaction rows
// with type='PAYMENT'. The status-override endpoint operates on Transaction.
function PaymentsPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [userIdFilter, setUserIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [editFor, setEditFor] = useState(null);
  const [editStatus, setEditStatus] = useState('');
  const [editReason, setEditReason] = useState('');
  const [mutatingId, setMutatingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (userIdFilter) params.set('userId', userIdFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    apiFetch(token, `${API}/payments?${params.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setItems(Array.isArray(r.items) ? r.items : []);
        setTotal(typeof r.total === 'number' ? r.total : 0);
      })
      .catch((e) => { if (!cancelled) setErr(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page, userIdFilter, statusFilter, fromDate, toDate]);

  const doStatusOverride = async (e) => {
    e?.preventDefault?.();
    if (!editFor) return;
    if (!editStatus || !editReason || editReason.length < 3) return;
    setMutatingId(editFor.id);
    try {
      const updated = await apiFetch(token, `${API}/payments/${editFor.id}/status`, {
        method: 'POST',
        body: { status: editStatus, reason: editReason },
      });
      toastSuccess('Статус платежа обновлён');
      setItems((prev) => prev.map((p) => (p.id === editFor.id ? { ...p, status: updated.status } : p)));
      setEditFor(null); setEditStatus(''); setEditReason('');
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось обновить статус');
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ flexShrink: 0 }}>
          <h1 className="page-title">Платежи</h1>
          <p className="page-subtitle">Список платежей и переопределение статуса</p>
        </div>
        <div className="admin-page-scroll">
          {err && <PageErrorBanner message={'Не удалось загрузить платежи.'} />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="text" className="form-input" placeholder="ID пользователя" value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 220 }} />
            <select className="form-select" value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ maxWidth: 200 }}>
              <option value="">Все статусы</option>
              <option value="completed">Завершено</option>
              <option value="pending">В обработке</option>
              <option value="scheduled">Запланировано</option>
              <option value="failed">Ошибка</option>
            </select>
            <input type="date" className="form-input" value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
            <input type="date" className="form-input" value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} />
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>ID</th><th>Дата</th><th>Мерчант</th><th>Сумма</th><th>Статус</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? (
                  <SkeletonRow columns={6} rows={5} />
                ) : items.length === 0 && !err ? (
                  <tr><td colSpan={6}>
                    <EmptyState heading="Платежей нет" body="Платежи появятся здесь после первой операции." icon="payments" />
                  </td></tr>
                ) : items.map((p) => (
                  <tr key={p.id} style={mutatingId === p.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.id.slice(-8)}</td>
                    <td>{new Date(p.createdAt).toLocaleString('ru-RU')}</td>
                    <td>{p.merchant || '—'}</td>
                    <td style={{ fontWeight: 700 }}>₽ {Number(p.amount).toLocaleString('ru-RU')}</td>
                    <td>{p.status}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => { setEditFor(p); setEditStatus(p.status); setEditReason(''); }}>Изменить статус</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Назад</button>
            <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)}>Вперёд →</button>
          </div>
        </div>
      </div>

      {editFor && (
        <div className="modal-overlay" onClick={() => setEditFor(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={doStatusOverride}>
            <h2 className="modal-title">Изменить статус платежа</h2>
            <div className="form-group">
              <label className="form-label">Новый статус</label>
              <select className="form-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="">— выберите —</option>
                <option value="completed">completed</option>
                <option value="pending">pending</option>
                <option value="scheduled">scheduled</option>
                <option value="failed">failed</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Причина</label>
              <input className="form-input" autoFocus value={editReason} onChange={(e) => setEditReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setEditFor(null)}>Отмена</button>
              <SpinnerButton type="submit" loading={mutatingId === editFor.id} className="btn btn-primary"
                disabled={!editStatus || !editReason || editReason.length < 3}>
                Изменить статус
              </SpinnerButton>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ==================== LIMITS PAGE ====================
// Phase 4.5 / 04.5-02 / ADMIN-07 — SpendingLimit CRUD.
function LimitsPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [userIdFilter, setUserIdFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editFor, setEditFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [mutatingId, setMutatingId] = useState(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({ userId: '', category: '', amount: '', period: 'MONTHLY' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (userIdFilter) params.set('userId', userIdFilter);
    apiFetch(token, `${API}/limits?${params.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setItems(Array.isArray(r.items) ? r.items : []);
        setTotal(typeof r.total === 'number' ? r.total : 0);
      })
      .catch((e) => { if (!cancelled) setErr(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page, userIdFilter, reload]);

  const doCreate = async (e) => {
    e?.preventDefault?.();
    setMutatingId('__create__');
    try {
      await apiFetch(token, `${API}/limits`, { method: 'POST', body: {
        userId: form.userId, category: form.category, amount: Number(form.amount), period: form.period,
      }});
      toastSuccess('Лимит сохранён');
      setShowCreate(false); setForm({ userId: '', category: '', amount: '', period: 'MONTHLY' });
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось создать лимит');
    } finally {
      setMutatingId(null);
    }
  };
  const doUpdate = async (e) => {
    e?.preventDefault?.();
    if (!editFor) return;
    setMutatingId(editFor.id);
    try {
      const body = {};
      if (form.category) body.category = form.category;
      if (form.amount !== '') body.amount = Number(form.amount);
      if (form.period) body.period = form.period;
      await apiFetch(token, `${API}/limits/${editFor.id}`, { method: 'PUT', body });
      toastSuccess('Лимит сохранён');
      setEditFor(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось обновить лимит');
    } finally {
      setMutatingId(null);
    }
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    setMutatingId(confirmDelete.id);
    try {
      await apiFetch(token, `${API}/limits/${confirmDelete.id}`, { method: 'DELETE' });
      toastSuccess('Лимит удалён');
      setConfirmDelete(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось удалить лимит');
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div><h1 className="page-title">Лимиты</h1><p className="page-subtitle">Лимиты расходов по категориям</p></div>
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setForm({ userId: '', category: '', amount: '', period: 'MONTHLY' }); }}>
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>add</span> Создать лимит
          </button>
        </div>
        <div className="admin-page-scroll">
          {err && <PageErrorBanner message={'Не удалось загрузить лимиты.'} />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="text" className="form-input" placeholder="ID пользователя" value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 220 }} />
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Пользователь</th><th>Категория</th><th>Лимит</th><th>Потрачено</th><th>Период</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? (
                  <SkeletonRow columns={6} rows={5} />
                ) : items.length === 0 && !err ? (
                  <tr><td colSpan={6}>
                    <EmptyState heading="Лимитов нет" body="Добавьте лимит, чтобы ограничить расходы пользователя." icon="speed" />
                  </td></tr>
                ) : items.map((l) => (
                  <tr key={l.id} style={mutatingId === l.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.userId.slice(-8)}</td>
                    <td>{l.category}</td>
                    <td style={{ fontWeight: 700 }}>₽ {Number(l.limitAmount).toLocaleString('ru-RU')}</td>
                    <td>₽ {Number(l.spentAmount).toLocaleString('ru-RU')}</td>
                    <td>{l.period}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={() => { setEditFor(l); setForm({ userId: l.userId, category: l.category, amount: String(l.limitAmount), period: (l.period || 'MONTHLY').toUpperCase() }); }}>Изменить</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(l)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Назад</button>
            <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)}>Вперёд →</button>
          </div>
        </div>
      </div>

      {(showCreate || editFor) && (
        <div className="modal-overlay" onClick={() => { setShowCreate(false); setEditFor(null); }}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={editFor ? doUpdate : doCreate}>
            <h2 className="modal-title">{editFor ? 'Изменить лимит' : 'Новый лимит'}</h2>
            {!editFor && (
              <div className="form-group">
                <label className="form-label">ID пользователя</label>
                <input className="form-input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Категория</label>
              <input className="form-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Лимит, ₽</label>
              <input className="form-input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Период</label>
              <select className="form-select" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                <option value="DAILY">DAILY</option>
                <option value="WEEKLY">WEEKLY</option>
                <option value="MONTHLY">MONTHLY</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => { setShowCreate(false); setEditFor(null); }}>Отмена</button>
              <SpinnerButton type="submit" loading={mutatingId === '__create__' || (editFor && mutatingId === editFor.id)} className="btn btn-primary">Сохранить</SpinnerButton>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Удалить лимит?"
        message="Лимит будет удалён. Списания больше не будут ограничены."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onConfirm={doDelete}
        onCancel={() => (mutatingId ? null : setConfirmDelete(null))}
      />
    </>
  );
}

// ==================== SUBSCRIPTIONS PAGE ====================
// Phase 4.5 / 04.5-02 / ADMIN-09 — Subscription CRUD.
function SubscriptionsPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [userIdFilter, setUserIdFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editFor, setEditFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [mutatingId, setMutatingId] = useState(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({ userId: '', name: '', amount: '', icon: 'subscriptions', nextPayment: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (userIdFilter) params.set('userId', userIdFilter);
    apiFetch(token, `${API}/subscriptions?${params.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setItems(Array.isArray(r.items) ? r.items : []);
        setTotal(typeof r.total === 'number' ? r.total : 0);
      })
      .catch((e) => { if (!cancelled) setErr(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page, userIdFilter, reload]);

  const doCreate = async (e) => {
    e?.preventDefault?.();
    setMutatingId('__create__');
    try {
      const body = {
        userId: form.userId, name: form.name,
        amount: Number(form.amount),
        icon: form.icon || 'subscriptions',
      };
      if (form.nextPayment) body.nextPayment = new Date(form.nextPayment).toISOString();
      await apiFetch(token, `${API}/subscriptions`, { method: 'POST', body });
      toastSuccess('Подписка сохранена');
      setShowCreate(false);
      setForm({ userId: '', name: '', amount: '', icon: 'subscriptions', nextPayment: '' });
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось создать подписку');
    } finally {
      setMutatingId(null);
    }
  };
  const doUpdate = async (e) => {
    e?.preventDefault?.();
    if (!editFor) return;
    setMutatingId(editFor.id);
    try {
      const body = {};
      if (form.name) body.name = form.name;
      if (form.amount !== '') body.amount = Number(form.amount);
      if (form.icon) body.icon = form.icon;
      if (form.nextPayment) body.nextPayment = new Date(form.nextPayment).toISOString();
      await apiFetch(token, `${API}/subscriptions/${editFor.id}`, { method: 'PUT', body });
      toastSuccess('Подписка сохранена');
      setEditFor(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось обновить подписку');
    } finally {
      setMutatingId(null);
    }
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    setMutatingId(confirmDelete.id);
    try {
      await apiFetch(token, `${API}/subscriptions/${confirmDelete.id}`, { method: 'DELETE' });
      toastSuccess('Подписка удалена');
      setConfirmDelete(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось удалить подписку');
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div><h1 className="page-title">Подписки</h1><p className="page-subtitle">Регулярные списания пользователей</p></div>
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setForm({ userId: '', name: '', amount: '', icon: 'subscriptions', nextPayment: '' }); }}>
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>add</span> Создать подписку
          </button>
        </div>
        <div className="admin-page-scroll">
          {err && <PageErrorBanner message={'Не удалось загрузить подписки.'} />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="text" className="form-input" placeholder="ID пользователя" value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 220 }} />
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Пользователь</th><th>Название</th><th>Сумма</th><th>Следующее списание</th><th>Активна</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? (
                  <SkeletonRow columns={6} rows={5} />
                ) : items.length === 0 && !err ? (
                  <tr><td colSpan={6}>
                    <EmptyState heading="Подписок нет" body="Добавьте подписку для регулярных списаний." icon="subscriptions" />
                  </td></tr>
                ) : items.map((s) => (
                  <tr key={s.id} style={mutatingId === s.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.userId.slice(-8)}</td>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td>₽ {Number(s.amount).toLocaleString('ru-RU')}</td>
                    <td>{s.nextPayment ? new Date(s.nextPayment).toLocaleDateString('ru-RU') : '—'}</td>
                    <td>{s.isActive ? <span style={{ color: 'var(--success)' }}>●</span> : <span style={{ color: 'var(--on-surface-variant)' }}>●</span>}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={() => {
                        setEditFor(s);
                        setForm({
                          userId: s.userId, name: s.name, amount: String(s.amount),
                          icon: s.icon || 'subscriptions',
                          nextPayment: s.nextPayment ? new Date(s.nextPayment).toISOString().slice(0, 10) : '',
                        });
                      }}>Изменить</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(s)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Назад</button>
            <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)}>Вперёд →</button>
          </div>
        </div>
      </div>

      {(showCreate || editFor) && (
        <div className="modal-overlay" onClick={() => { setShowCreate(false); setEditFor(null); }}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={editFor ? doUpdate : doCreate}>
            <h2 className="modal-title">{editFor ? 'Изменить подписку' : 'Новая подписка'}</h2>
            {!editFor && (
              <div className="form-group">
                <label className="form-label">ID пользователя</label>
                <input className="form-input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Название</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Сумма, ₽</label>
              <input className="form-input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Иконка (Material Icon)</label>
              <input className="form-input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Следующее списание</label>
              <input className="form-input" type="date" value={form.nextPayment} onChange={(e) => setForm({ ...form, nextPayment: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => { setShowCreate(false); setEditFor(null); }}>Отмена</button>
              <SpinnerButton type="submit" loading={mutatingId === '__create__' || (editFor && mutatingId === editFor.id)} className="btn btn-primary">Сохранить</SpinnerButton>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Удалить подписку?"
        message="Подписка будет удалена. Регулярные списания прекратятся."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onConfirm={doDelete}
        onCancel={() => (mutatingId ? null : setConfirmDelete(null))}
      />
    </>
  );
}

// ==================== BANK CARDS PAGE ====================
// Phase 4.5 / 04.5-03 / ADMIN-03 — BankCard block/unblock/issue/delete.
// Plan calls for integration into Users detail; Users page has no detail panel
// in the current single-file SPA, so this lands as a standalone page filtered
// by userId. Russian copy per UI-SPEC.
function BankCardsPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [userIdFilter, setUserIdFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showIssue, setShowIssue] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [mutatingId, setMutatingId] = useState(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({ userId: '', accountId: '', type: 'debit', tier: 'standard', maskedNumber: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (userIdFilter) params.set('userId', userIdFilter);
    apiFetch(token, `${API}/bankCards?${params.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setItems(Array.isArray(r.items) ? r.items : []);
        setTotal(typeof r.total === 'number' ? r.total : 0);
      })
      .catch((e) => { if (!cancelled) setErr(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page, userIdFilter, reload]);

  const doBlock = async () => {
    if (!confirmBlock) return;
    setMutatingId(confirmBlock.id);
    try {
      const path = confirmBlock.isActive
        ? `${API}/bankCards/${confirmBlock.id}/block`
        : `${API}/bankCards/${confirmBlock.id}/unblock`;
      await apiFetch(token, path, { method: 'POST', body: {} });
      toastSuccess(confirmBlock.isActive ? 'Карта заблокирована' : 'Карта разблокирована');
      setConfirmBlock(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось изменить карту');
    } finally {
      setMutatingId(null);
    }
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    setMutatingId(confirmDelete.id);
    try {
      await apiFetch(token, `${API}/bankCards/${confirmDelete.id}`, { method: 'DELETE' });
      toastSuccess('Карта удалена');
      setConfirmDelete(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось удалить карту');
    } finally {
      setMutatingId(null);
    }
  };
  const doIssue = async (e) => {
    e?.preventDefault?.();
    setMutatingId('__issue__');
    try {
      const body = {
        userId: form.userId,
        accountId: form.accountId,
        type: form.type,
        tier: form.tier,
      };
      if (form.maskedNumber) body.maskedNumber = form.maskedNumber;
      await apiFetch(token, `${API}/bankCards`, { method: 'POST', body });
      toastSuccess('Карта выпущена');
      setShowIssue(false);
      setForm({ userId: '', accountId: '', type: 'debit', tier: 'standard', maskedNumber: '' });
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось выпустить карту');
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div><h1 className="page-title">Банковские карты</h1><p className="page-subtitle">Block / unblock / issue / delete</p></div>
          <button className="btn btn-primary" onClick={() => setShowIssue(true)}>
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>add</span> Выпустить карту
          </button>
        </div>
        <div className="admin-page-scroll">
          {err && <PageErrorBanner message={'Не удалось загрузить карты.'} />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="text" className="form-input" placeholder="ID пользователя" value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }} style={{ maxWidth: 220 }} />
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Пользователь</th><th>Счёт</th><th>Номер</th><th>Тип</th><th>Тариф</th><th>Статус</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? (
                  <SkeletonRow columns={7} rows={5} />
                ) : items.length === 0 && !err ? (
                  <tr><td colSpan={7}>
                    <EmptyState heading="Банковских карт нет" body="У пользователя пока нет банковских карт." icon="credit_card" />
                  </td></tr>
                ) : items.map((c) => (
                  <tr key={c.id} style={mutatingId === c.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.userId.slice(-8)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.accountId.slice(-8)}</td>
                    <td>{c.maskedNumber}</td>
                    <td>{c.type}</td>
                    <td>{c.tier}</td>
                    <td>{c.isActive ? 'Активна' : 'Заблокирована'}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={() => setConfirmBlock(c)}>{c.isActive ? 'Заблокировать' : 'Разблокировать'}</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(c)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Назад</button>
            <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)}>Вперёд →</button>
          </div>
        </div>
      </div>

      {showIssue && (
        <div className="modal-overlay" onClick={() => setShowIssue(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={doIssue}>
            <h2 className="modal-title">Выпустить карту</h2>
            <div className="form-group"><label className="form-label">ID пользователя</label>
              <input className="form-input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">ID счёта</label>
              <input className="form-input" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Тип</label>
              <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="debit">debit</option><option value="credit">credit</option>
              </select></div>
            <div className="form-group"><label className="form-label">Тариф</label>
              <input className="form-input" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Маскированный номер (необязательно)</label>
              <input className="form-input" value={form.maskedNumber} onChange={(e) => setForm({ ...form, maskedNumber: e.target.value })} placeholder="**** 1234" /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowIssue(false)}>Отмена</button>
              <SpinnerButton type="submit" loading={mutatingId === '__issue__'} className="btn btn-primary">Выпустить</SpinnerButton>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmBlock}
        title={confirmBlock?.isActive ? 'Заблокировать карту?' : 'Разблокировать карту?'}
        message={confirmBlock?.isActive
          ? `Карта ${confirmBlock?.maskedNumber || ''} будет заблокирована. Пользователь не сможет ей платить.`
          : `Карта ${confirmBlock?.maskedNumber || ''} будет разблокирована.`}
        confirmLabel={confirmBlock?.isActive ? 'Заблокировать' : 'Разблокировать'}
        cancelLabel="Отмена"
        destructive={confirmBlock?.isActive}
        onConfirm={doBlock}
        onCancel={() => (mutatingId ? null : setConfirmBlock(null))}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Удалить карту?"
        message="Карта будет полностью удалена из системы. Это действие необратимо."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onConfirm={doDelete}
        onCancel={() => (mutatingId ? null : setConfirmDelete(null))}
      />
    </>
  );
}

// ==================== USER CARDS PAGE ====================
// Phase 4.5 / 04.5-03 / ADMIN-04 — UserCard inventory: revoke + HP edit.
function UserCardsPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [userIdFilter, setUserIdFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [editHp, setEditHp] = useState(null);
  const [hpValue, setHpValue] = useState('');
  const [mutatingId, setMutatingId] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!userIdFilter) { setItems([]); return; }
    let cancelled = false;
    setLoading(true); setErr(null);
    apiFetch(token, `${API}/userCards/by-user/${encodeURIComponent(userIdFilter)}`)
      .then((r) => {
        if (cancelled) return;
        setItems(Array.isArray(r.items) ? r.items : []);
      })
      .catch((e) => { if (!cancelled) setErr(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, userIdFilter, reload]);

  const doRevoke = async () => {
    if (!confirmRevoke) return;
    setMutatingId(confirmRevoke.id);
    try {
      await apiFetch(token, `${API}/userCards/${confirmRevoke.id}`, { method: 'DELETE' });
      toastSuccess('Карта изъята');
      setConfirmRevoke(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось изъять карту');
    } finally {
      setMutatingId(null);
    }
  };
  const doHpEdit = async (e) => {
    e?.preventDefault?.();
    if (!editHp) return;
    const v = Number(hpValue);
    if (!Number.isFinite(v) || v < 0) {
      toastErrorFromAppError({ code: 'VALIDATION_FAILED' }, 'Введите неотрицательное число');
      return;
    }
    setMutatingId(editHp.id);
    try {
      await apiFetch(token, `${API}/userCards/${editHp.id}/health`, { method: 'PUT', body: { health: v } });
      toastSuccess('HP обновлено');
      setEditHp(null); setHpValue('');
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось обновить HP');
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ flexShrink: 0 }}>
          <h1 className="page-title">Инвентарь карт-коллекции</h1>
          <p className="page-subtitle">Изъять карту из инвентаря или скорректировать HP</p>
        </div>
        <div className="admin-page-scroll">
          {err && <PageErrorBanner message={'Не удалось загрузить инвентарь.'} />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input type="text" className="form-input" placeholder="ID пользователя"
              value={userIdFilter} onChange={(e) => setUserIdFilter(e.target.value)} style={{ maxWidth: 320 }} />
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Карта</th><th>HP</th><th>Источник</th><th>Получена</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? (
                  <SkeletonRow columns={5} rows={5} />
                ) : !userIdFilter ? (
                  <tr><td colSpan={5}>
                    <EmptyState heading="Введите ID пользователя" body="Инвентарь подгружается по конкретному пользователю." icon="search" />
                  </td></tr>
                ) : items.length === 0 && !err ? (
                  <tr><td colSpan={5}>
                    <EmptyState heading="Карт нет" body="У пользователя пока нет карт-коллекции." icon="style" />
                  </td></tr>
                ) : items.map((u) => (
                  <tr key={u.id} style={mutatingId === u.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontWeight: 600 }}>{u.collectionCard?.name || u.collectionCardId.slice(-8)}</td>
                    <td>{u.health}</td>
                    <td>{u.source}</td>
                    <td>{new Date(u.acquiredAt).toLocaleDateString('ru-RU')}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={() => { setEditHp(u); setHpValue(String(u.health)); }}>Изменить HP</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmRevoke(u)}>Изъять</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editHp && (
        <div className="modal-overlay" onClick={() => setEditHp(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={doHpEdit}>
            <h2 className="modal-title">Изменить HP карты</h2>
            <div className="form-group">
              <label className="form-label">HP</label>
              <input className="form-input" type="number" value={hpValue}
                onChange={(e) => setHpValue(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setEditHp(null)}>Отмена</button>
              <SpinnerButton type="submit" loading={mutatingId === editHp.id} className="btn btn-primary">Сохранить</SpinnerButton>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRevoke}
        title="Изъять карту?"
        message={`Карта-коллекция «${confirmRevoke?.collectionCard?.name || ''}» будет изъята из инвентаря пользователя.`}
        confirmLabel="Изъять"
        cancelLabel="Отмена"
        destructive
        onConfirm={doRevoke}
        onCancel={() => (mutatingId ? null : setConfirmRevoke(null))}
      />
    </>
  );
}

// ==================== DECKS PAGE ====================
// Phase 4.5 / 04.5-03 / ADMIN-05 — view by user + break-active.
function DecksPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [userIdFilter, setUserIdFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmBreak, setConfirmBreak] = useState(null);
  const [mutatingId, setMutatingId] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!userIdFilter) { setItems([]); return; }
    let cancelled = false;
    setLoading(true); setErr(null);
    apiFetch(token, `${API}/decks/by-user/${encodeURIComponent(userIdFilter)}`)
      .then((r) => {
        if (cancelled) return;
        setItems(Array.isArray(r.items) ? r.items : []);
      })
      .catch((e) => { if (!cancelled) setErr(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, userIdFilter, reload]);

  const doBreak = async () => {
    if (!confirmBreak) return;
    setMutatingId(confirmBreak.id);
    try {
      await apiFetch(token, `${API}/decks/${confirmBreak.id}/break-active`, { method: 'POST', body: {} });
      toastSuccess('Активная колода сброшена');
      setConfirmBreak(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось сбросить колоду');
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ flexShrink: 0 }}>
          <h1 className="page-title">Колоды</h1>
          <p className="page-subtitle">Просмотр и сброс активной колоды пользователя</p>
        </div>
        <div className="admin-page-scroll">
          {err && <PageErrorBanner message={'Не удалось загрузить колоды.'} />}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input type="text" className="form-input" placeholder="ID пользователя"
              value={userIdFilter} onChange={(e) => setUserIdFilter(e.target.value)} style={{ maxWidth: 320 }} />
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Название</th><th>Активна</th><th>Карт</th><th>Создана</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? (
                  <SkeletonRow columns={5} rows={3} />
                ) : !userIdFilter ? (
                  <tr><td colSpan={5}>
                    <EmptyState heading="Введите ID пользователя" body="Список колод подгружается по конкретному пользователю." icon="search" />
                  </td></tr>
                ) : items.length === 0 && !err ? (
                  <tr><td colSpan={5}>
                    <EmptyState heading="Колод нет" body="У пользователя пока нет колод." icon="layers" />
                  </td></tr>
                ) : items.map((d) => (
                  <tr key={d.id} style={mutatingId === d.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td>{d.isActive ? 'Да' : 'Нет'}</td>
                    <td>{d._count?.deckCards ?? d.deckCards?.length ?? 0}</td>
                    <td>{new Date(d.createdAt).toLocaleDateString('ru-RU')}</td>
                    <td>
                      {d.isActive ? (
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirmBreak(d)}>Сбросить активную</button>
                      ) : <span style={{ color: 'var(--on-surface-variant)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmBreak}
        title="Сбросить активную колоду?"
        message="Активная колода будет деактивирована. При следующем заходе пользователя система пересоберёт колоду по умолчанию."
        confirmLabel="Сбросить"
        cancelLabel="Отмена"
        destructive
        onConfirm={doBreak}
        onCancel={() => (mutatingId ? null : setConfirmBreak(null))}
      />
    </>
  );
}

// ==================== QUESTS PAGE ====================
// Phase 4.5 / 04.5-03 / ADMIN-06 — Quest CRUD (soft-delete via isActive=false)
// + UserQuest reset.
function QuestsPage() {
  const { token } = useToken();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editFor, setEditFor] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showResetUQ, setShowResetUQ] = useState(false);
  const [mutatingId, setMutatingId] = useState(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({ title: '', description: '', icon: 'flag', rewardMB: 0, type: 'PURCHASE', condition: '{}' });
  const [uqForm, setUqForm] = useState({ userQuestId: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    apiFetch(token, `${API}/quests?page=${page}&limit=${limit}`)
      .then((r) => {
        if (cancelled) return;
        setItems(Array.isArray(r.items) ? r.items : []);
        setTotal(typeof r.total === 'number' ? r.total : 0);
      })
      .catch((e) => { if (!cancelled) setErr(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page, reload]);

  const doCreate = async (e) => {
    e?.preventDefault?.();
    setMutatingId('__create__');
    try {
      const body = {
        title: form.title,
        description: form.description,
        icon: form.icon,
        rewardMB: Number(form.rewardMB) || 0,
        type: form.type,
        condition: form.condition || '{}',
      };
      await apiFetch(token, `${API}/quests`, { method: 'POST', body });
      toastSuccess('Квест создан');
      setShowCreate(false); setForm({ title: '', description: '', icon: 'flag', rewardMB: 0, type: 'PURCHASE', condition: '{}' });
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось создать квест');
    } finally { setMutatingId(null); }
  };
  const doUpdate = async (e) => {
    e?.preventDefault?.();
    if (!editFor) return;
    setMutatingId(editFor.id);
    try {
      const body = {};
      if (form.title) body.title = form.title;
      if (form.description) body.description = form.description;
      if (form.icon) body.icon = form.icon;
      if (form.rewardMB !== '') body.rewardMB = Number(form.rewardMB);
      if (form.type) body.type = form.type;
      if (form.condition) body.condition = form.condition;
      await apiFetch(token, `${API}/quests/${editFor.id}`, { method: 'PUT', body });
      toastSuccess('Квест сохранён');
      setEditFor(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось обновить квест');
    } finally { setMutatingId(null); }
  };
  const doDeactivate = async () => {
    if (!confirmDeactivate) return;
    setMutatingId(confirmDeactivate.id);
    try {
      await apiFetch(token, `${API}/quests/${confirmDeactivate.id}/deactivate`, { method: 'POST', body: {} });
      toastSuccess('Квест деактивирован');
      setConfirmDeactivate(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось деактивировать');
    } finally { setMutatingId(null); }
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    setMutatingId(confirmDelete.id);
    try {
      await apiFetch(token, `${API}/quests/${confirmDelete.id}`, { method: 'DELETE' });
      toastSuccess('Квест удалён');
      setConfirmDelete(null);
      setReload((n) => n + 1);
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось удалить квест');
    } finally { setMutatingId(null); }
  };
  const doResetUQ = async (e) => {
    e?.preventDefault?.();
    setMutatingId('__resetuq__');
    try {
      await apiFetch(token, `${API}/quests/user-quest/${encodeURIComponent(uqForm.userQuestId)}/reset`, { method: 'POST', body: {} });
      toastSuccess('Прогресс квеста сброшен');
      setShowResetUQ(false); setUqForm({ userQuestId: '' });
    } catch (err2) {
      toastErrorFromAppError(err2, 'Не удалось сбросить прогресс');
    } finally { setMutatingId(null); }
  };

  return (
    <>
      <div className="admin-page">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div><h1 className="page-title">Квесты</h1><p className="page-subtitle">Каталог квестов + сброс прогресса</p></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setShowResetUQ(true)}>Сбросить UserQuest</button>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <span className="material-icons-outlined" style={{ fontSize: 18 }}>add</span> Создать квест
            </button>
          </div>
        </div>
        <div className="admin-page-scroll">
          {err && <PageErrorBanner message={'Не удалось загрузить квесты.'} />}
          <div className="table-container">
            <table>
              <thead><tr><th>Название</th><th>Тип</th><th>Награда MB</th><th>Активен</th><th>Действия</th></tr></thead>
              <tbody>
                {loading ? (
                  <SkeletonRow columns={5} rows={5} />
                ) : items.length === 0 && !err ? (
                  <tr><td colSpan={5}>
                    <EmptyState heading="Квестов нет" body="Создайте первый квест." icon="flag" />
                  </td></tr>
                ) : items.map((q) => (
                  <tr key={q.id} style={mutatingId === q.id ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
                    <td style={{ fontWeight: 600 }}>{q.title}</td>
                    <td>{q.type}</td>
                    <td>{q.rewardMB}</td>
                    <td>{q.isActive ? 'Да' : 'Нет'}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={() => { setEditFor(q); setForm({ title: q.title, description: q.description, icon: q.icon, rewardMB: String(q.rewardMB), type: q.type, condition: q.condition }); }}>Изменить</button>
                      {q.isActive && <button className="btn btn-sm" onClick={() => setConfirmDeactivate(q)}>Деактивировать</button>}
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(q)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'flex-end' }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Стр. {page} из {Math.max(1, Math.ceil(total / limit))} · Всего: {total}</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Назад</button>
            <button className="btn btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)}>Вперёд →</button>
          </div>
        </div>
      </div>

      {(showCreate || editFor) && (
        <div className="modal-overlay" onClick={() => { setShowCreate(false); setEditFor(null); }}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={editFor ? doUpdate : doCreate}>
            <h2 className="modal-title">{editFor ? 'Изменить квест' : 'Новый квест'}</h2>
            <div className="form-group"><label className="form-label">Название</label>
              <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Описание</label>
              <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Иконка</label>
              <input className="form-input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Тип</label>
              <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="PURCHASE">PURCHASE</option><option value="TRANSFER">TRANSFER</option><option value="OTHER">OTHER</option>
              </select></div>
            <div className="form-group"><label className="form-label">Награда MB</label>
              <input className="form-input" type="number" value={form.rewardMB} onChange={(e) => setForm({ ...form, rewardMB: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Условие (JSON)</label>
              <input className="form-input" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => { setShowCreate(false); setEditFor(null); }}>Отмена</button>
              <SpinnerButton type="submit" loading={mutatingId === '__create__' || (editFor && mutatingId === editFor.id)} className="btn btn-primary">Сохранить</SpinnerButton>
            </div>
          </form>
        </div>
      )}

      {showResetUQ && (
        <div className="modal-overlay" onClick={() => setShowResetUQ(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={doResetUQ}>
            <h2 className="modal-title">Сбросить прогресс квеста</h2>
            <div className="form-group"><label className="form-label">ID UserQuest</label>
              <input className="form-input" value={uqForm.userQuestId} onChange={(e) => setUqForm({ userQuestId: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowResetUQ(false)}>Отмена</button>
              <SpinnerButton type="submit" loading={mutatingId === '__resetuq__'} className="btn btn-primary">Сбросить</SpinnerButton>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeactivate}
        title="Деактивировать квест?"
        message="Квест перестанет быть доступным новым пользователям. Существующий прогресс сохранится."
        confirmLabel="Деактивировать"
        cancelLabel="Отмена"
        destructive
        onConfirm={doDeactivate}
        onCancel={() => (mutatingId ? null : setConfirmDeactivate(null))}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Удалить квест?"
        message="Квест будет удалён. Прогресс пользователей по нему сохранится только в audit-логе."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onConfirm={doDelete}
        onCancel={() => (mutatingId ? null : setConfirmDelete(null))}
      />
    </>
  );
}

// ===== APP SHELL =====
const NAV_ITEMS = [
  { key: 'dashboard',     label: 'Дашборд', icon: 'dashboard' },
  { key: 'users',         label: 'Пользователи', icon: 'people' },
  { key: 'cards',         label: 'Карты-коллекции', icon: 'style' },
  { key: 'bankCards',     label: 'Банковские карты', icon: 'credit_card' },
  { key: 'userCards',     label: 'Инвентарь', icon: 'inventory_2' },
  { key: 'decks',         label: 'Колоды', icon: 'layers' },
  { key: 'quests',        label: 'Квесты', icon: 'flag' },
  { key: 'accounts',      label: 'Счета', icon: 'account_balance' },
  { key: 'transactions',  label: 'Операции', icon: 'receipt_long' },
  { key: 'payments',      label: 'Платежи', icon: 'payments' },
  { key: 'limits',        label: 'Лимиты', icon: 'speed' },
  { key: 'subscriptions', label: 'Подписки', icon: 'subscriptions' },
  { key: 'simulate',      label: 'Симуляция', icon: 'play_circle' },
];

function readStoredTheme() {
  try {
    return localStorage.getItem('admin_theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  const { token, clearToken } = useToken();
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  // A-M5 — explicit lazy initializer. The previous form `useState(readStoredTheme)`
  // accidentally relied on React's auto-call-if-function behavior; the explicit
  // arrow makes intent clear and is safe against future React semantics changes
  // (e.g. component-as-state-initializer linting). Per TRIAGE A-M5.
  const [theme, setTheme] = useState(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('admin_theme', theme);
    } catch {}
  }, [theme]);

  // Validate stored token on mount (or whenever it changes after login).
  useEffect(() => {
    if (!token) return;
    apiFetch(token, `${API}/dashboard`)
      .catch(() => {
        clearToken();
      });
  }, [token, clearToken]);

  if (!user) return (
    <>
      <LoginPage onLogin={setUser} />
      <ToastHost />
    </>
  );

  return (
    <div className="admin-shell">
      <aside className="admin-aside">
        <div style={{ padding: '0 20px 24px', flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>MT-Банк</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', letterSpacing: 2, marginTop: 2 }}>ADMIN PANEL</div>
        </div>
        <nav className="admin-aside-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '12px 20px', border: 'none', cursor: 'pointer',
                background: page === item.key ? 'var(--primary-container)' : 'transparent',
                color: page === item.key ? 'var(--primary)' : 'var(--on-surface-variant)',
                fontWeight: page === item.key ? 700 : 500, fontSize: 14,
                borderLeft: page === item.key ? '3px solid var(--primary)' : '3px solid transparent',
              }}
            >
              <span className="material-icons-outlined" style={{ fontSize: 20 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{user.name}</div>
          <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginBottom: 12 }}>{user.phone}</div>
          <button
            type="button"
            className="theme-toggle-hit"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          >
            <span
              className={`material-icons-outlined theme-toggle-icon theme-toggle-sun ${
                theme === 'light' ? 'theme-toggle-icon--in' : 'theme-toggle-icon--out'
              }`}
            >
              wb_sunny
            </span>
            <span
              className={`material-icons-outlined theme-toggle-icon theme-toggle-moon ${
                theme === 'dark' ? 'theme-toggle-icon--in' : 'theme-toggle-icon--out'
              }`}
            >
              dark_mode
            </span>
          </button>
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => {
            clearToken();
            setUser(null);
          }}>Выйти</button>
        </div>
      </aside>
      <main className="admin-main">
        {page === 'dashboard'     && <DashboardPage />}
        {page === 'users'         && <UsersPage />}
        {page === 'cards'         && <CardsPage />}
        {page === 'bankCards'     && <BankCardsPage />}
        {page === 'userCards'     && <UserCardsPage />}
        {page === 'decks'         && <DecksPage />}
        {page === 'quests'        && <QuestsPage />}
        {page === 'accounts'      && <AccountsPage />}
        {page === 'transactions'  && <TransactionsPage />}
        {page === 'payments'      && <PaymentsPage />}
        {page === 'limits'        && <LimitsPage />}
        {page === 'subscriptions' && <SubscriptionsPage />}
        {page === 'simulate'      && <SimulatePage />}
      </main>
      <ToastHost />
    </div>
  );
}
