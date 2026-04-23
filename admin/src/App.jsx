import React, { useState, useEffect } from 'react';

const API = '/api/admin';
let TOKEN = localStorage.getItem('admin_token') || '';

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ===== LOGIN =====
function LoginPage({ onLogin }) {
  const [phone, setPhone] = useState('+79000000000');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      }).then(r => r.json());
      if (data.accessToken && data.user?.isAdmin) {
        TOKEN = data.accessToken;
        localStorage.setItem('admin_token', data.accessToken);
        onLogin(data.user);
      } else if (data.accessToken && !data.user?.isAdmin) {
        setError('Этот аккаунт не является администратором');
      } else {
        setError(data.error || 'Ошибка входа');
      }
    } catch (err) {
      setError('Ошибка соединения');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <form onSubmit={handleSubmit} style={{ width: 360, background: 'var(--surface-card)', padding: 40, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>MT-Банк</h1>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', letterSpacing: 3, marginBottom: 32 }}>ПАНЕЛЬ АДМИНИСТРАТОРА</p>
        {error && <div style={{ background: 'rgba(186,26,26,0.08)', color: 'var(--error)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}
        <div className="form-group">
          <label className="form-label">Телефон</label>
          <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">ПИН-код</label>
          <input className="form-input" type="password" maxLength={4} value={pin} onChange={e => setPin(e.target.value)} placeholder="****" />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} type="submit">Войти</button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--on-surface-variant)' }}>Админ: +79000000000 / ПИН: 0000</p>
      </form>
    </div>
  );
}

// ===== DASHBOARD =====
function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [extended, setExtended] = useState(null);

  useEffect(() => {
    apiFetch(`${API}/dashboard`).then(setStats).catch(() => {});
    apiFetch(`${API}/dashboard/extended`).then(setExtended).catch(() => {});
  }, []);

  if (!stats) return <p>Загрузка...</p>;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Дашборд</h1>
        <p className="page-subtitle">Обзор системы MT-Банк</p>
      </div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Пользователи</div><div className="stat-value">{stats.totalUsers}</div></div>
        <div className="stat-card"><div className="stat-label">Карт в обороте</div><div className="stat-value">{stats.totalCards}</div></div>
        <div className="stat-card"><div className="stat-label">MB баллов</div><div className="stat-value" style={{ color: 'var(--primary)' }}>{stats.totalMBInCirculation?.toLocaleString()}</div></div>
        <div className="stat-card"><div className="stat-label">Транзакций</div><div className="stat-value">{stats.totalTransactions}</div></div>
        {extended && <div className="stat-card"><div className="stat-label">Общий баланс</div><div className="stat-value" style={{ color: 'var(--success)' }}>₽ {extended.totalBalance?.toLocaleString('ru-RU')}</div></div>}
      </div>
      
      {extended && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
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
    </>
  );
}

// ===== USERS =====
function UsersPage() {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', phone: '', pin: '1234', mbPoints: 0, status: 'STANDARD' });

  // FIX: API returns { users, total, limit, offset } — extract .users array
  const load = () => apiFetch(`${API}/users`).then(data => setUsers(data.users ?? [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try {
      await apiFetch(`${API}/users/${editing}`, { method: 'PUT', body: form });
      setEditing(null);
      load();
    } catch (err) { alert(err.message); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`${API}/users`, { method: 'POST', body: createForm });
      setShowCreate(false);
      setCreateForm({ name: '', phone: '', pin: '1234', mbPoints: 0, status: 'STANDARD' });
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1 className="page-title">Пользователи</h1><p className="page-subtitle">Управление аккаунтами</p></div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <span className="material-icons-outlined" style={{ fontSize: 18 }}>add</span> Создать
        </button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Имя</th><th>Телефон</th><th>MB Баллы</th><th>Статус</th><th>Карты</th><th>Действия</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 700 }}>{u.name}</td>
                <td>{u.phone}</td>
                <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{u.mbPoints?.toLocaleString()}</td>
                <td><span className={`badge badge-${u.status?.toLowerCase()}`}>{u.status}</span></td>
                <td>{u._count?.userCards || 0}</td>
                <td>
                  <button className="btn btn-sm btn-primary" onClick={() => { setEditing(u.id); setForm({ name: u.name, mbPoints: u.mbPoints, status: u.status }); }}>
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Редактировать пользователя</h2>
            <div className="form-group"><label className="form-label">Имя</label><input className="form-input" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">MB Баллы</label><input className="form-input" type="number" value={form.mbPoints || 0} onChange={e => setForm({...form, mbPoints: parseInt(e.target.value)})} /></div>
            <div className="form-group"><label className="form-label">Статус</label>
              <select className="form-select" value={form.status || ''} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="STANDARD">Standard</option><option value="SILVER">Silver</option><option value="GOLD">Gold</option><option value="PLATINUM">Platinum</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Новый ПИН (если нужно)</label><input className="form-input" maxLength={4} placeholder="****" onChange={e => setForm({...form, pin: e.target.value})} /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setEditing(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSave}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleCreate}>
            <h2 className="modal-title">Новый пользователь</h2>
            <div className="form-group"><label className="form-label">Имя</label><input className="form-input" required value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Телефон</label><input className="form-input" required value={createForm.phone} onChange={e => setCreateForm({...createForm, phone: e.target.value})} placeholder="+79..." /></div>
            <div className="form-group"><label className="form-label">ПИН-код</label><input className="form-input" required maxLength={4} value={createForm.pin} onChange={e => setCreateForm({...createForm, pin: e.target.value})} /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Создать</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ===== CARDS =====
function CardsPage() {
  const [cards, setCards] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', brandName: '', brandIcon: 'style', rarity: 'COMMON', cashbackPercent: 1.0, mbValue: 10, maxHealth: 100, description: '' });

  const load = () => apiFetch(`${API}/cards`).then(setCards).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`${API}/cards`, { method: 'POST', body: { ...form, cashbackPercent: parseFloat(form.cashbackPercent), mbValue: parseInt(form.mbValue), maxHealth: parseInt(form.maxHealth) } });
      setShowCreate(false);
      setForm({ name: '', brandName: '', brandIcon: 'style', rarity: 'COMMON', cashbackPercent: 1.0, mbValue: 10, maxHealth: 100, description: '' });
      load();
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Деактивировать эту карту?')) return;
    await apiFetch(`${API}/cards/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1 className="page-title">Шаблоны карт</h1><p className="page-subtitle">Управление коллекционными картами</p></div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <span className="material-icons-outlined" style={{ fontSize: 18 }}>add</span> Создать карту
        </button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Имя</th><th>Бренд</th><th>Редкость</th><th>Кэшбэк</th><th>MB</th><th>Здоровье</th><th>Статус</th><th>Действия</th></tr></thead>
          <tbody>
            {cards.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 700 }}>{c.name}</td>
                <td>{c.brandName}</td>
                <td><span className={`badge badge-${c.rarity.toLowerCase()}`}>{c.rarity}</span></td>
                <td style={{ fontWeight: 700 }}>{c.cashbackPercent}%</td>
                <td>{c.mbValue}</td>
                <td>{c.maxHealth}</td>
                <td>{c.isActive ? <span style={{ color: 'var(--success)' }}>●</span> : <span style={{ color: 'var(--error)' }}>●</span>}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>Удалить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleCreate}>
            <h2 className="modal-title">Новая карта</h2>
            <div className="form-group"><label className="form-label">Название</label><input className="form-input" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Бренд</label><input className="form-input" required value={form.brandName} onChange={e => setForm({...form, brandName: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Иконка (Material Icon)</label><input className="form-input" value={form.brandIcon} onChange={e => setForm({...form, brandIcon: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Редкость</label>
              <select className="form-select" value={form.rarity} onChange={e => setForm({...form, rarity: e.target.value})}>
                <option value="COMMON">Common</option><option value="RARE">Rare</option><option value="EPIC">Epic</option><option value="LEGENDARY">Legendary</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group"><label className="form-label">Кэшбэк %</label><input className="form-input" type="number" step="0.1" value={form.cashbackPercent} onChange={e => setForm({...form, cashbackPercent: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">MB Стоимость</label><input className="form-input" type="number" value={form.mbValue} onChange={e => setForm({...form, mbValue: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Макс. HP</label><input className="form-input" type="number" value={form.maxHealth} onChange={e => setForm({...form, maxHealth: e.target.value})} /></div>
            </div>
            <div className="form-group"><label className="form-label">Описание</label><input className="form-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Создать</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ===== SIMULATE TRANSACTION =====
function SimulatePage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ userId: '', accountId: '', amount: 500, type: 'PURCHASE', category: 'Покупки', merchant: 'Тестовый магазин' });
  const [accounts, setAccounts] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // FIX: API returns { users, total, limit, offset } — extract .users array
  useEffect(() => {
    apiFetch(`${API}/users`).then(data => setUsers(data.users ?? [])).catch(() => {});
  }, []);

  const loadAccounts = async (userId) => {
    setForm(f => ({ ...f, userId, accountId: '' }));
    setAccounts([]);
    if (!userId) return;
    try {
      const data = await apiFetch(`${API}/users/${userId}/accounts`);
      setAccounts(data);
      if (data.length > 0) {
        setForm(f => ({ ...f, accountId: data[0].id }));
      }
    } catch {
      setAccounts([]);
    }
  };

  const handleSimulate = async (e) => {
    e.preventDefault();
    if (!form.userId) { alert('Выберите пользователя'); return; }
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
      const data = await apiFetch(`${API}/simulate-transaction`, {
        method: 'POST',
        body,
      });
      setResult(data);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Симуляция транзакций</h1>
        <p className="page-subtitle">Создайте тестовую транзакцию для проверки дропа карт и переводов</p>
      </div>
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
            <button type="submit" className="btn btn-primary" style={{ width: '100%', opacity: loading ? 0.7 : 1 }} disabled={loading}>
              {loading ? '⏳ Выполняется...' : (<><span className="material-icons-outlined" style={{ fontSize: 18 }}>play_arrow</span> Выполнить транзакцию</>)}
            </button>
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
    </>
  );
}

// ===== APP SHELL =====
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Дашборд', icon: 'dashboard' },
  { key: 'users',     label: 'Пользователи', icon: 'people' },
  { key: 'cards',     label: 'Карты', icon: 'style' },
  { key: 'simulate',  label: 'Симуляция', icon: 'play_circle' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');

  // Validate stored token on mount
  useEffect(() => {
    if (!TOKEN) return;
    apiFetch(`${API}/dashboard`)
      .catch(() => {
        TOKEN = '';
        localStorage.removeItem('admin_token');
      });
  }, []);

  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 240, background: 'var(--surface-card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '24px 0' }}>
        <div style={{ padding: '0 20px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>MT-Банк</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', letterSpacing: 2, marginTop: 2 }}>ADMIN PANEL</div>
        </div>
        <nav style={{ flex: 1 }}>
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
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{user.name}</div>
          <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginBottom: 12 }}>{user.phone}</div>
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => {
            TOKEN = '';
            localStorage.removeItem('admin_token');
            setUser(null);
          }}>Выйти</button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
        {page === 'dashboard' && <DashboardPage />}
        {page === 'users'     && <UsersPage />}
        {page === 'cards'     && <CardsPage />}
        {page === 'simulate'  && <SimulatePage />}
      </main>
    </div>
  );
}
