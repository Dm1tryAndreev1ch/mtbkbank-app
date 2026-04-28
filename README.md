# 🏦 MT-Банк — Gamified Banking App

> MVP банковского приложения с системой коллекционных карточек, кэшбэком через колоды и обменом карт.

---

## 🛠 Стек

| Компонент | Технология | Порт |
|---|---|---|
| Backend API | Node.js 20 + Express + Prisma | `:3000` |
| База данных | PostgreSQL 16 | `:5432` |
| Кэш / Rate-limiter | Redis 7 | `:6379` |
| Мобильное приложение | React Native (Expo) | `:8081` |
| Админ-панель | React + Vite | `:5173` |

---

## 🚀 Быстрый старт

### Требования

- Docker ≥ 24 + Compose v2 (`docker compose`)
- Node.js 20 LTS (только для mobile / admin)

### Бэкенд — dev-режим (горячая перезагрузка)

```bash
cd backend
cp .env.example .env

# 1. Собрать dev-образ и поднять все сервисы
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d

# 2. Применить миграции (один раз после первого up или после down -v)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:migrate:deploy

# 3. Залить тестовые данные
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:seed

# Проверка
curl http://localhost:3000/healthz  # → {"status":"ok"}
```

> **Важно:** `up --build` **не применяет миграции автоматически** — это сделано намеренно,
> чтобы падение контейнера на середине миграции не оставляло БД в broken state.
> Запускайте `db:migrate:deploy` вручную после старта.

> `working_dir: /app` прописан в `docker-compose.yml`, поэтому все `exec`-команды
> находят `prisma/schema.prisma` без дополнительных флагов.

> Подробнее — в [backend/DEVELOPMENT.md](backend/DEVELOPMENT.md)

### Мобильное приложение

```bash
cd mobile
npm install
npx expo start
# Нажмите `a` для Android-эмулятора
```

### Админ-панель

```bash
cd admin
npm install
npm run dev
# http://localhost:5173
```

---

## 🔄 Сброс БД с чистого листа

Если база в плохом состоянии (миграция зависла, том устарел, `P3009` / `P3018`
при `migrate deploy`) — единственный надёжный способ:

```bash
cd backend

# 1. Уничтожить контейнеры И тома (postgres-данные удаляются физически)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v

# 2. Поднять заново с чистой БД
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d

# 3. Применить миграции + seed
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:migrate:deploy
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:seed

# Или одной командой (migrate reset --force + seed):
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:reset

# Проверка
curl http://localhost:3000/healthz  # → {"status":"ok"}
```

> **`npm run db:reset`** = `prisma migrate reset --force` + `node src/seed/index.js`  
> Дропает схему, прогоняет все миграции с нуля, заливает тестовые данные.

> **Никогда не используйте `migrate reset` без предварительного `down -v`**,
> если в БД уже есть failed-запись в `_prisma_migrations` — Prisma не сможет
> применить reset поверх сломанного состояния тома.

---

## ⚠️ Частые ошибки миграций

| Ошибка | Причина | Решение |
|---|---|---|
| `P3009` — failed migration | Том не был сброшен, старая запись о сбое в `_prisma_migrations` | `down -v` → `up --build` → `db:migrate:deploy` |
| `P3009` — failed migration (повторно) | Предыдущий `resolve` снял блок, но следующая миграция тоже упала | Повторить `migrate resolve --rolled-back <имя>` → `db:migrate:deploy` либо сразу `down -v` |
| `P3018` — 42704 `type "cardsource" does not exist` | `'CardSource'::regtype` бросает исключение если тип не найден в сессии — **исправлено** в `20260428000000_missing_columns` (используется безопасный `JOIN pg_type`) | Убедитесь что последний `git pull` получен, затем `down -v` → `up --build` → `db:migrate:deploy` |
| `P3018` — `CREATE INDEX CONCURRENTLY` inside transaction | `CONCURRENTLY` нельзя использовать внутри транзакции — **исправлено** в `20260427000500_idx_user_card_user` (убран `CONCURRENTLY`) | Убедитесь что последний `git pull` получен, затем `down -v` → `up --build` → `db:migrate:deploy` |
| `P3018` — column already exists | Контейнер упал после `COMMIT` DDL, до записи `finished_at` | `migrate resolve --applied <имя>` → `db:migrate:deploy` |
| `P2022` — column does not exist | Колонка добавлена в `schema.prisma` без миграции | Создать миграцию вручную (`migrate dev`) |

### Если `migrate deploy` падает с `P3009` на чистой БД

Это означает что одна из миграций упала при предыдущем запуске и оставила запись в `_prisma_migrations`.
Даже `down -v` + `up --build` не помогают если `git pull` не был выполнен перед пересборкой —
контейнер собирается со старым кодом миграций.

```bash
# Правильный порядок полного сброса:
git pull
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:migrate:deploy
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:seed
```

---

## 🐳 Production-деплой

```bash
cd backend

# 1. Секреты (JWT)
mkdir -p secrets
echo -n "$(openssl rand -hex 32)" > secrets/jwt_secret.txt
echo -n "$(openssl rand -hex 32)" > secrets/jwt_refresh_secret.txt
chmod 600 secrets/*.txt

# 2. Переменные окружения
cp .env.example .env.prod
# Отредактируйте: POSTGRES_PASSWORD, ALLOWED_ORIGINS, SENTRY_DSN

# 3. Сборка и запуск
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 4. Миграции — запускать ПОСЛЕ старта контейнера, ОДИН раз за деплой
docker compose -f docker-compose.prod.yml exec api npm run db:migrate:deploy

# 5. Healthcheck
curl http://localhost:3000/healthz  # → {"status":"ok"}
```

> **Важно**: не запускайте `prisma migrate deploy` напрямую через `npx` без
> `--schema prisma/schema.prisma` — при нестандартном CWD Prisma не найдёт схему.
> Скрипт `db:migrate:deploy` уже содержит правильный флаг.

> Подробнее — в [OPERATIONS.md](OPERATIONS.md)

---

## 🗂 Структура проекта

```
gm-bank-app/
├── backend/                         # API + Docker
│   ├── Dockerfile                   # Мультистейд: builder → dev → runtime
│   ├── docker-compose.yml           # База: postgres + redis + api (working_dir: /app)
│   ├── docker-compose.dev.yml       # Dev-оверлей: nodemon, pino-pretty, volume-маунты src/ + prisma/
│   ├── docker-compose.prod.yml      # Prod: healthchecks, Docker secrets, restart
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/              # 11 последовательных миграций
│   │   └── MIGRATIONS.md            # Expand-then-contract + CONCURRENT index policy
│   ├── src/
│   └── DEVELOPMENT.md               # Полный гайд по локальной разработке
├── mobile/                          # React Native (Expo)
│   └── eas.json                     # preview + production профили
├── admin/                           # Админ-панель (Vite + React)
├── docs/
│   ├── adr/ADR-001-no-csrf-middleware.md
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── CARD_SYSTEM.md
├── OPERATIONS.md                    # Production runbook
└── README.md
```

---

## 🧪 Тестовые аккаунты (seed)

| Роль | Телефон | ПИН |
|---|---|---|
| Клиент Gold | +79001234567 | 1234 |
| Клиент Silver | +79009876543 | 1234 |
| Админ | +79000000000 | 0000 |

```bash
# Залить seed (после migrate deploy)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:seed

# Или полный сброс + seed одной командой:
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:reset
```

---

## 🎮 Ключевые механики

- При покупке — дроп карточки (Обычная → Редкая → Эпическая → Легендарная)
- Колода из 5 карт — кэшбэк суммируется (до 30%+)
- HP-декай — карты теряют HP каждый tick (60с по умолчанию), при 0 — уничтожаются
- Обмен / дарение / конвертация в MB-баллы

---

## 📖 Документация

| Файл | Описание |
|---|---|
| [backend/DEVELOPMENT.md](backend/DEVELOPMENT.md) | Полный гайд по локальной разработке |
| [OPERATIONS.md](OPERATIONS.md) | Production runbook |
| [docs/API.md](docs/API.md) | REST API Reference |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Архитектура |
| [docs/CARD_SYSTEM.md](docs/CARD_SYSTEM.md) | Система карточек |
| [backend/prisma/MIGRATIONS.md](backend/prisma/MIGRATIONS.md) | Политика миграций |
| [docs/adr/ADR-001-no-csrf-middleware.md](docs/adr/ADR-001-no-csrf-middleware.md) | ADR: нет CSRF-миддлваре |
