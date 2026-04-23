# MT-Банк API — Документация

Base URL: `http://localhost:3000/api`

## Авторизация

Все запросы (кроме `/auth/login`) требуют заголовок:
```
Authorization: Bearer <token>
```

---

## Auth

### POST /auth/login
Вход по ПИН-коду.
```json
// Request
{ "phone": "+79001234567", "pin": "1234" }

// Response
{ "token": "eyJ...", "user": { "id": "...", "name": "Александр", "mbPoints": 12450, "status": "GOLD" } }
```

---

## Users

### GET /users/me
Текущий профиль пользователя.

### PUT /users/me
Обновить имя, аватар.
```json
{ "name": "Новое имя", "avatarUrl": "https://..." }
```

### GET /users/me/stats
Статистика: MB, статус, число карт, колод, обменов.

---

## Accounts

### GET /accounts
Список счетов пользователя (main, savings, currency).

### POST /accounts/:id/topup
```json
{ "amount": 5000 }
```

---

## Transactions

### GET /transactions
Параметры: `limit`, `offset`, `category`, `type`

### GET /transactions/analytics
Параметры: `period` (week/month/year)
```json
{ "totalSpent": 45600, "breakdown": [{ "category": "Покупки", "amount": 20000, "percentage": 44 }] }
```

### POST /transactions/transfer
```json
{ "fromAccountId": "...", "toAccountId": "...", "amount": 1000 }
```

---

## Payments

### GET /payments/categories
Список категорий платежей.

### POST /payments
```json
{ "accountId": "...", "amount": 500, "category": "Покупки", "merchant": "Apple Store" }
```
**Response** включает `droppedCard` если при покупке выпала карта!

### GET /payments/scheduled
Запланированные платежи.

---

## Cards

### GET /cards/collection
Все шаблоны карт. Параметр: `rarity`

### GET /cards/inventory
Карты пользователя. Параметры: `rarity`, `sort` (date/rarity)

### GET /cards/:id
Детальная информация по карте.

### POST /cards/sacrifice
Жертвоприношение карты для исцеления другой.
```json
{ "sacrificeId": "...", "targetId": "..." }
// Response: { "healAmount": 100, "newHealth": 95, "card": {...} }
```

### POST /cards/convert
Конвертация карты в MB баллы.
```json
{ "cardId": "..." }
// Response: { "baseMB": 50, "healthBonus": 25, "totalMB": 75 }
```

### GET /cards/stats/rarities
Распределение карт по редкости.

---

## Decks

### GET /decks
Все колоды с расчётом кэшбэка.

### POST /decks
```json
{ "name": "Моя колода" }
```

### PUT /decks/:id
```json
{ "cardIds": ["id1", "id2", "id3"] }
```
Макс. 5 карт. Одна карта — одна колода.

### PUT /decks/:id/activate
Сделать колоду активной.

### GET /decks/:id/cashback
Разбивка кэшбэка по картам.

---

## Trades

### POST /trades
```json
{ "offeredCardId": "...", "toUserId": "...", "requestedCardId": "...", "mbPointsOffer": 100 }
```

### PUT /trades/:id/accept | /reject
Принять или отклонить обмен.

### POST /trades/send
Подарить карту (бесплатно).
```json
{ "cardId": "...", "toUserId": "..." }
```

---

## Quests

### GET /quests/daily
Ежедневные задания (авто-назначение при первом запросе).

### POST /quests/:id/claim
Забрать награду за выполненный квест.

---

## Subscriptions

### GET /subscriptions | PUT /subscriptions/:id

---

## Limits

### GET /limits | PUT /limits/:id

---

## Notifications

### GET /notifications | PUT /notifications/:id/read | PUT /notifications/read-all

---

## Admin API

Все `/api/admin/*` маршруты требуют `isAdmin: true`.

- `GET /admin/dashboard` — статистика
- `GET /admin/dashboard/extended` — расширенная статистика (балансы, последние транзакции)
- `GET/POST /admin/users` — управление пользователями
- `PUT /admin/users/:id` — редактирование
- `GET/POST/PUT/DELETE /admin/cards` — шаблоны карт
- `POST /admin/grant-card` — выдать карту пользователю
- `POST /admin/simulate-transaction` — симуляция транзакции
- `GET /admin/users/:id/accounts` — счета пользователя для симуляций/операций
