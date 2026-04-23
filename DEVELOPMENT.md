# DEVELOPMENT.md — MT-Банк

Руководство по локальной разработке, архитектуре и известным проблемам.

---

## Содержание

- [Стек](#стек)
- [Быстрый старт](#быстрый-старт)
- [Переменные окружения](#переменные-окружения)
- [Структура проекта](#структура-проекта)
- [Архитектура бэкенда](#архитектура-бэкенда)
- [Система карточек](#система-карточек)
- [Тестовые аккаунты](#тестовые-аккаунты)
- [Известные проблемы и ограничения](#известные-проблемы-и-ограничения)
- [Changelog](#changelog)

---

## Стек

| Компонент | Технология | Порт |
|---|---|---|
| Backend API | Node.js + Express + Prisma ORM | `:3000` |
| База данных | PostgreSQL 16 (Docker) | `:5432` |
| Кэш | Redis 7 (Docker) | `:6379` |
| Мобильное приложение | React Native (Expo) | `:8081` |
| Админ-панель | React + Vite | `:5173` |

**Дизайн-система:** «Pristine Vault» — шрифт Manrope, Electric Blue `#4F8EF7`, Gold `#fdcf49`, glassmorphism dark theme.

---

## Быстрый старт

### 1. Бэкенд

```bash
cd backend
cp .env.example .env        # заполнить переменные
docker-compose up -d        # поднять PostgreSQL + Redis
npx prisma migrate dev      # применить схему
node src/seed/index.js      # сидировать тестовые данные
npm run dev                 # запустить API (nodemon)
```

### 2. Мобильное приложение

```bash
cd mobile
npm install
npx expo start
```

Для Android-устройства или эмулятора: нажать `a` в терминале Expo.

### 3. Админ-панель

```bash
cd admin
npm install
npm run dev
```

Открыть [http://localhost:5173](http://localhost:5173).

---

## Переменные окружения

Файл `backend/.env` (создать из `.env.example`):

```env
# База данных
DATABASE_URL="postgresql://postgres:password@localhost:5432/mtbbank"

# JWT
JWT_SECRET="your-very-secret-key-min-32-chars"
JWT_REFRESH_SECRET="another-secret-key-for-refresh-tokens"

# Redis
REDIS_URL="redis://localhost:6379"

# Push-уведомления (Expo)
EXPO_ACCESS_TOKEN=""

# CORS — разрешённые origins (через запятую)
ALLOWED_ORIGINS="http://localhost:8081,http://localhost:3000,exp://localhost:8081"

# Порт
PORT=3000
```

> ⚠️ `JWT_SECRET` и `DATABASE_URL` **обязательны**. Сервер не запустится без `.env`.

---

## Структура проекта

```
mtbbank-app/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma       # Схема БД (Prisma)
│   ├── src/
│   │   ├── index.js            # Точка входа (Express)
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT auth + admin guard
│   │   ├── routes/
│   │   │   ├── auth.js         # /api/auth
│   │   │   ├── accounts.js     # /api/accounts
│   │   │   ├── cards.js        # /api/cards
│   │   │   ├── transactions.js # /api/transactions
│   │   │   ├── users.js        # /api/users
│   │   │   ├── admin.js        # /api/admin
│   │   │   └── ...
│   │   ├── services/
│   │   │   └── cardEngine.js   # Игровая механика карт
│   │   ├── cache.js            # Redis helpers
│   │   ├── push.js             # Expo push notifications
│   │   └── websocket.js        # Socket.io
│   └── package.json
├── mobile/
│   └── app/
│       └── (tabs)/
│           ├── index.tsx       # Главная
│           ├── analytics.tsx   # Аналитика
│           ├── payments.tsx    # Платежи
│           ├── cards.tsx       # Карточки (магазин + инвентарь)
│           └── profile.tsx     # Профиль
├── admin/                      # Админ-панель (React + Vite)
├── docs/                       # Документация
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── CARD_SYSTEM.md
│   └── DEPLOYMENT.md
└── README.md
```

---

## Архитектура бэкенда

### Аутентификация

- **Access Token** — JWT, TTL 15 минут. Содержит `{ userId, isAdmin }`.
- **Refresh Token** — JWT, TTL 30 дней. Хранится в БД в поле `User.refreshToken` (поддерживает ревокацию при logout).
- Refresh-токен ротируется при каждом `/api/auth/refresh`.

```
POST /api/auth/login    → { accessToken, refreshToken, user }
POST /api/auth/refresh  → { accessToken, refreshToken }
POST /api/auth/logout   → { success: true }  (инвалидирует refreshToken в БД)
```

### Порядок middleware в `index.js`

```
dotenv.config()
  → helmet()              # security headers
  → rateLimit(200/15min)  # защита от брутфорса
  → cors()
  → express.json()
  → prisma attach
  → routes
```

### Кэш (Redis)

| Ключ | TTL | Описание |
|---|---|---|
| `cards:collection:all` | 300 с | Все карты коллекции |
| `cards:collection:rarity:{r}` | 300 с | Карты по редкости |

> При добавлении новых карточек через админ-панель кэш сбрасывается автоматически (или устаревает через 5 минут).

### Порядок маршрутов в `cards.js`

Статичные пути **всегда** объявляются выше динамических `/:id`:

```
GET  /collection
GET  /inventory
GET  /stats/rarities    ← ДОЛЖЕН быть выше /:id
POST /buy
POST /sacrifice
POST /convert
GET  /:id               ← динамический — последний
```

---

## Система карточек

### Редкости и дроп-шансы

| Редкость | Дроп (от 30% транзакций) | Кэшбэк | HP/день | MB-ценность |
|---|---|---|---|---|
| COMMON | 60% | 0.5–1.5% | -2 | 10 |
| RARE | 25% | 1.5–3.0% | -1.5 | 50 |
| EPIC | 12% | 3.0–5.0% | -1.0 | 200 |
| LEGENDARY | 3% | 5.0–10.0% | -0.5 | 1000 |

### Цены в магазине (MB-баллы)

Если у карты не задан `mbPrice` — используются дефолты:

| Редкость | Цена (MB) |
|---|---|
| COMMON | 300 |
| RARE | 800 |
| EPIC | 1 500 |
| LEGENDARY | 3 500 |

### Покупка карты (`POST /api/cards/buy`)

1. Проверить, что карта активна (`isActive: true`)
2. Проверить, что карта не куплена ранее (дубли запрещены)
3. Проверить баланс MB
4. Списать MB и создать `UserCard` с `source: 'SHOP'`

---

## Тестовые аккаунты

| Роль | Телефон | ПИН |
|---|---|---|
| Клиент Gold | `+79001234567` | `1234` |
| Клиент Silver | `+79009876543` | `1234` |
| Администратор | `+79000000000` | `0000` |

---

## Известные проблемы и ограничения

### Решённые (см. [Changelog](#changelog))

- ~~`isAdmin` не передавался в JWT — все admin-маршруты возвращали 403~~
- ~~Поле `refreshToken` отсутствовало в схеме Prisma — login/logout падал~~
- ~~`dotenv` не вызывался — `JWT_SECRET` не загружался из `.env`~~
- ~~`helmet` и `express-rate-limit` не подключены~~
- ~~`GET /api/cards/stats/rarities` перехватывался динамическим `/:id`~~
- ~~`POST /buy` не проверял повторные покупки~~
- ~~`amount` в `/topup` не проходил через `parseFloat` — NaN-значения не отклонялись~~

### Актуальные ограничения

- **Миграция БД обязательна** после последнего коммита:
  ```bash
  cd backend && npx prisma migrate dev --name "add-refresh-token-and-shop-source"
  ```
- **`cardEngine.js`** — функция `processCardDrop` вызывается из `admin.js` с несоответствующей сигнатурой (`numericAmount` вместо `transactionId`). Не критично для магазина, но дроп-карты при admin-операциях работают некорректно.
- **Ротация admin-прав** — смена `isAdmin` в БД вступает в силу только после повторного логина пользователя (токен не перевыпускается автоматически).
- **WebSocket** — `broadcastToUser` в `cardEngine.js` требует настроенного `socket.io` инстанса. При отсутствии подключения тихо падает без уведомления.

---

## Changelog

### `a66091a` — 2026-04-23 (последний)

**fix(critical): add refreshToken to schema, isAdmin to JWT, helmet/dotenv/rateLimit, fix topup and cards.buy**

| Файл | Изменение |
|---|---|
| `prisma/schema.prisma` | Добавлено `refreshToken String?` в `User`; добавлен `SHOP` в `CardSource`; добавлен `mbPrice Int?` в `CollectionCard` |
| `routes/auth.js` | `signAccess()` теперь включает `isAdmin` → `adminMiddleware` работает |
| `routes/auth.js` | `/refresh` читает `isAdmin` из БД при ротации токена |
| `src/index.js` | Добавлен `require('dotenv').config()` — `.env` загружается корректно |
| `src/index.js` | Подключены `helmet` и `express-rate-limit` (200 req / 15 min) |
| `routes/accounts.js` | `amount` через `parseFloat` + защита от NaN |
| `routes/cards.js` | `POST /buy` — проверка дублей + явный `source: 'SHOP'` |
| `routes/cards.js` | Маршрут `/:id` перемещён в конец; `GET /stats/rarities` теперь доступен |

### Предыдущие коммиты

- Добавлена система магазина карточек (`cards.js` shop tab)
- Реализован refresh-token flow в `auth.js`
- Добавлены CORS allowlist, WebSocket, push-уведомления
