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

# Собрать dev-образ и поднять все сервисы
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# В отдельном терминале — применить миграции и залить seed (один раз)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:migrate:deploy
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:seed

# Проверка
curl http://localhost:3000/healthz  # → {"status":"ok"}
```

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
#    Используйте npm-скрипт: он передаёт --schema явно и не зависит от CWD
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
│   │   ├── migrations/
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
# Залить seed
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run db:seed
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
