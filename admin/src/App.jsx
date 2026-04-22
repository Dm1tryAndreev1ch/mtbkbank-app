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
      if (data.token && data.user?.isAdmin) {
        TOKEN = data.token;
        localStorage.setItem('admin_token', data.token);
        onLogin(data.user);
      } else if (data.token && !data.user?.isAdmin) {
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

  const load = () => apiFetch(`${API}/users`).then(setUsers).catch(() => {});
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

  useEffect(() => { apiFetch(`${API}/users`).then(setUsers).catch(() => {}); }, []);

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
      // If the admin endpoint doesn't exist, try to get accounts from the simulate endpoint directly
      // We'll auto-select later on the backend
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
              {result.droppedCard ? (
                <div style={{ background: 'rgba(79,142,247,0.08)', padding: 16, borderRadius: 12 }}>
                  <p style={{ fontWeight: 700, color: 'var(--primary)' }}>🎴 Выпала карта!</p>
                  <p style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{result.droppedCard.name}</p>
                  <span className={`badge badge-${result.droppedCard.rarity?.toLowerCase()}`}>{result.droppedCard.rarity}</span>
                </div>
              ) : (
                <div style={{ background: 'var(--surface-low)', padding: 16, borderRadius: 12 }}>
                  <p style={{ color: 'var(--on-surface-variant)' }}>Карта не выпала в этот раз</p>
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--on-surface-variant)' }}>Выполните транзакцию, чтобы увидеть результат</p>
          )}
        </div>
      </div>
    </>
  );
}

// ===== CONFIG =====
function ConfigPage() {
  const [config, setConfig] = useState({});
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState('');

  useEffect(() => { apiFetch(`${API}/config`).then(setConfig).catch(() => {}); }, []);

  const handleSave = async (key) => {
    try {
      let parsed;
      try { parsed = JSON.parse(value); } catch { parsed = value; }
      await apiFetch(`${API}/config/${key}`, { method: 'PUT', body: { value: parsed } });
      setEditing(null);
      apiFetch(`${API}/config`).then(setConfig);
    } catch (err) { alert(err.message); }
  };

  const configLabels = {
    card_drop_rate: 'Шанс дропа карты (0-1)',
    health_decay_rates: 'Скорость потери здоровья (по редкости)',
    max_deck_size: 'Макс. карт в колоде',
    mb_conversion_rates: 'Курс конвертации в MB (по редкости)',
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Системные настройки</h1>
        <p className="page-subtitle">Конфигурация игровой экономики</p>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Параметр</th><th>Значение</th><th>Действия</th></tr></thead>
          <tbody>
            {Object.entries(config).map(([key, val]) => (
              <tr key={key}>
                <td><div style={{ fontWeight: 700 }}>{configLabels[key] || key}</div><div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{key}</div></td>
                <td>
                  {editing === key ? (
                    <textarea className="form-input" rows={3} value={value} onChange={e => setValue(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 13 }} />
                  ) : (
                    <code style={{ fontSize: 13, background: 'var(--surface-low)', padding: '4px 8px', borderRadius: 4 }}>
                      {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
                    </code>
                  )}
                </td>
                <td>
                  {editing === key ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => handleSave(key)}>Сохранить</button>
                      <button className="btn btn-sm" onClick={() => setEditing(null)}>Отмена</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => { setEditing(key); setValue(typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)); }}>
                      Изменить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===== QUESTS =====
function QuestsPage() {
  const [quests, setQuests] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', icon: 'emoji_events', rewardMB: 50, type: 'DAILY', condition: '{}' });

  const load = () => apiFetch(`${API}/quests`).then(setQuests).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await apiFetch(`${API}/quests`, { method: 'POST', body: { ...form, rewardMB: parseInt(form.rewardMB) } });
    setShowCreate(false);
    load();
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1 className="page-title">Квесты</h1><p className="page-subtitle">Управление ежедневными и еженедельными заданиями</p></div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <span className="material-icons-outlined" style={{ fontSize: 18 }}>add</span> Создать квест
        </button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Название</th><th>Описание</th><th>Тип</th><th>Награда MB</th><th>Статус</th></tr></thead>
          <tbody>
            {quests.map(q => (
              <tr key={q.id}>
                <td style={{ fontWeight: 700 }}><span className="material-icons-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>{q.icon}</span>{q.title}</td>
                <td style={{ maxWidth: 300 }}>{q.description}</td>
                <td><span className="badge badge-rare">{q.type}</span></td>
                <td style={{ fontWeight: 700, color: 'var(--primary)' }}>+{q.rewardMB}</td>
                <td>{q.isActive ? <span style={{ color: 'var(--success)' }}>● Активен</span> : <span style={{ color: 'var(--error)' }}>● Выключен</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleCreate}>
            <h2 className="modal-title">Новый квест</h2>
            <div className="form-group"><label className="form-label">Название</label><input className="form-input" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Описание</label><input className="form-input" required value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group"><label className="form-label">Иконка</label><input className="form-input" value={form.icon} onChange={e => setForm({...form, icon: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Тип</label><select className="form-select" value={form.type} onChange={e => setForm({...form, type: e.target.value})}><option>DAILY</option><option>WEEKLY</option></select></div>
              <div className="form-group"><label className="form-label">Награда MB</label><input className="form-input" type="number" value={form.rewardMB} onChange={e => setForm({...form, rewardMB: e.target.value})} /></div>
            </div>
            <div className="form-group"><label className="form-label">Условие (JSON)</label><input className="form-input" value={form.condition} onChange={e => setForm({...form, condition: e.target.value})} /></div>
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

// ===== TRANSACTIONS =====
function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ type: '', search: '' });

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter.type) qs.append('type', filter.type);
      if (filter.search) qs.append('search', filter.search);
      const data = await apiFetch(`${API}/transactions?${qs.toString()}`);
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter.type]);

  const handleAdjust = async (t) => {
    const reason = prompt('Причина корректировки (возврата):');
    if (!reason) return;
    try {
      await apiFetch(`${API}/transactions/adjust`, {
        method: 'POST',
        body: { userId: t.userId, accountId: t.fromAccountId || t.toAccountId, amount: t.amount, reason, type: 'refund' }
      });
      alert('Корректировка выполнена');
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Транзакции</h1>
        <p className="page-subtitle">Все операции в системе</p>
      </div>
      
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <input 
          className="form-input" 
          placeholder="Поиск по мерчанту / категории" 
          value={filter.search} 
          onChange={e => setFilter({ ...filter, search: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && load()}
          style={{ width: 300 }}
        />
        <select className="form-select" value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })} style={{ width: 200 }}>
          <option value="">Все типы</option>
          <option value="PURCHASE">Покупки</option>
          <option value="TRANSFER_IN">Входящие переводы</option>
          <option value="TRANSFER_OUT">Исходящие переводы</option>
          <option value="TOPUP">Пополнения</option>
          <option value="ADMIN_ADJUSTMENT">Корректировки</option>
        </select>
        <button className="btn btn-primary" onClick={load}>Найти</button>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>Дата</th><th>Пользователь</th><th>Тип</th><th>Мерчант / Описание</th><th>Сумма</th><th>Действия</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6">Загрузка...</td></tr> : transactions.map(t => (
              <tr key={t.id}>
                <td style={{ fontSize: 12 }}>{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                <td><div style={{fontWeight: 700}}>{t.user?.name}</div><div style={{fontSize: 12, color: 'var(--on-surface-variant)'}}>{t.user?.phone}</div></td>
                <td><span className={`badge badge-standard`}>{t.type}</span></td>
                <td><div style={{fontWeight: 700}}>{t.merchant}</div><div style={{fontSize: 12, color: 'var(--on-surface-variant)'}}>{t.description}</div></td>
                <td style={{ fontWeight: 700, color: t.type === 'TRANSFER_IN' || t.type === 'TOPUP' || (t.type === 'ADMIN_ADJUSTMENT' && t.category === 'Возврат') ? 'var(--success)' : 'inherit' }}>
                  {t.amount} ₽
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => handleAdjust(t)}>Возврат</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===== ACCOUNTS =====
function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`${API}/accounts`);
      setAccounts(data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdjustBalance = async (acc) => {
    const amountStr = prompt(`Укажите сумму для корректировки баланса (отрицательная для списания).\nТекущий баланс: ${acc.balance} ₽`);
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return alert('Неверная сумма');
    
    const reason = prompt('Причина корректировки:');
    if (!reason) return;

    try {
      await apiFetch(`${API}/accounts/${acc.id}/balance`, {
        method: 'PUT',
        body: { amount, reason }
      });
      alert('Баланс обновлен');
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Банковские счета</h1>
        <p className="page-subtitle">Управление счетами и балансами пользователей</p>
      </div>
      
      <div className="table-container">
        <table>
          <thead><tr><th>Пользователь</th><th>Название счёта</th><th>Тип</th><th>Баланс</th><th>Действия</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="5">Загрузка...</td></tr> : accounts.map(a => (
              <tr key={a.id}>
                <td><div style={{fontWeight: 700}}>{a.user?.name}</div><div style={{fontSize: 12, color: 'var(--on-surface-variant)'}}>{a.user?.phone}</div></td>
                <td>{a.name}</td>
                <td><span className={`badge badge-standard`}>{a.type}</span></td>
                <td style={{ fontWeight: 700, fontSize: 16 }}>{a.balance?.toLocaleString('ru-RU')} {a.currency}</td>
                <td>
                  <button className="btn btn-sm btn-primary" onClick={() => handleAdjustBalance(a)}>Корректировать</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===== BROADCAST =====
function BroadcastPage() {
  const [form, setForm] = useState({ title: '', body: '', icon: 'campaign', targetStatus: '', targetUserId: '' });
  const [sending, setSending] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!confirm('Отправить уведомление?')) return;
    setSending(true);
    try {
      const res = await apiFetch(`${API}/notifications/broadcast`, {
        method: 'POST',
        body: form
      });
      alert(`Успешно отправлено. Охвачено пользователей: ${res.sentTo}`);
      setForm({ ...form, title: '', body: '' });
    } catch (err) { alert(err.message); }
    finally { setSending(false); }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Массовая рассылка</h1>
        <p className="page-subtitle">Отправка PUSH и In-App уведомлений пользователям</p>
      </div>

      <div className="table-container" style={{ padding: 32, maxWidth: 600 }}>
        <form onSubmit={handleSend}>
          <div className="form-group">
            <label className="form-label">Заголовок</label>
            <input className="form-input" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Например: Важное обновление!" />
          </div>
          <div className="form-group">
            <label className="form-label">Текст уведомления</label>
            <textarea className="form-input" rows={4} required value={form.body} onChange={e => setForm({...form, body: e.target.value})} placeholder="Текст сообщения..." />
          </div>
          <div className="form-group">
            <label className="form-label">Иконка (Material Icons)</label>
            <input className="form-input" value={form.icon} onChange={e => setForm({...form, icon: e.target.value})} />
          </div>
          
          <div className="form-group" style={{ marginTop: 24 }}>
            <label className="form-label">Аудитория (Оставьте пустым для отправки всем)</label>
            <select className="form-select" value={form.targetStatus} onChange={e => setForm({...form, targetStatus: e.target.value, targetUserId: ''})}>
              <option value="">Все пользователи</option>
              <option value="STANDARD">Только STANDARD</option>
              <option value="SILVER">Только SILVER</option>
              <option value="GOLD">Только GOLD</option>
              <option value="PLATINUM">Только PLATINUM</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={sending}>
            {sending ? 'Отправка...' : 'Отправить уведомление'}
          </button>
        </form>
      </div>
    </>
  );
}

// ===== MAIN APP =====
const NAV_ITEMS = [
  { key: 'dashboard', icon: 'dashboard', label: 'Дашборд' },
  { key: 'users', icon: 'people', label: 'Пользователи' },
  { key: 'transactions', icon: 'receipt_long', label: 'Транзакции' },
  { key: 'accounts', icon: 'account_balance', label: 'Счета' },
  { key: 'cards', icon: 'style', label: 'Шаблоны карт' },
  { key: 'simulate', icon: 'play_circle', label: 'Симуляция' },
  { key: 'quests', icon: 'emoji_events', label: 'Квесты' },
  { key: 'broadcast', icon: 'campaign', label: 'Рассылка' },
  { key: 'config', icon: 'settings', label: 'Настройки' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');

  useEffect(() => {
    if (TOKEN) {
      fetch('/api/users/me', { headers: { Authorization: `Bearer ${TOKEN}` } })
        .then(r => r.json())
        .then(data => { if (data.isAdmin) setUser(data); else { TOKEN = ''; localStorage.removeItem('admin_token'); } })
        .catch(() => { TOKEN = ''; localStorage.removeItem('admin_token'); });
    }
  }, []);

  if (!user) return <LoginPage onLogin={setUser} />;

  const handleLogout = () => {
    TOKEN = '';
    localStorage.removeItem('admin_token');
    setUser(null);
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'users': return <UsersPage />;
      case 'transactions': return <TransactionsPage />;
      case 'accounts': return <AccountsPage />;
      case 'cards': return <CardsPage />;
      case 'simulate': return <SimulatePage />;
      case 'quests': return <QuestsPage />;
      case 'broadcast': return <BroadcastPage />;
      case 'config': return <ConfigPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-brand">MT<span>-Банк</span></div>
        <div className="sidebar-sub">АДМИНИСТРИРОВАНИЕ</div>
        {NAV_ITEMS.map(item => (
          <div
            key={item.key}
            className={`nav-item ${page === item.key ? 'active' : ''}`}
            onClick={() => setPage(item.key)}
          >
            <span className="material-icons-outlined">{item.icon}</span>
            {item.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="nav-item" style={{ color: 'var(--error)' }} onClick={handleLogout}>
          <span className="material-icons-outlined">logout</span> Выйти
        </div>
      </nav>
      <main className="main">{renderPage()}</main>
    </div>
  );
}
