# 🏦 MT-Банк — Gamified Banking App

> MVP банковского приложения с уникальной системой коллекционных карточек, кэшбэком через колоды и обменом карт.

---

## 🎮 Ключевые фишки

### Система карточек
- При каждой покупке — дроп карточки случайной редкости (Обычная → Редкая → Эпическая → Легендарная)
- Каждая карта даёт процент кэшбэка

### Колоды
- Соберите колоду из 5 карт
- Кэшбэк карт в колоде суммируется (до 30%+!)
- Только активная колода работает

### Здоровье карт
- У каждой карты есть HP, которое тратится каждый день
- **При 0 HP карта исчезает!**
- Жертвуйте другие карты, чтобы восстановить HP

### Обмен
- Обменивайте карты с друзьями
- Конвертируйте карты в MB баллы
- Дарите карты

---

## 🏗 Архитектура

| Компонент | Технология | Порт |
|-----------|-----------|------|
| Backend API | Node.js 20 + Express + Prisma | :3000 |
| База данных | PostgreSQL 16 (Docker) | :5432 |
| Кэш / Rate-limiter | Redis 7 (Docker) | :6379 |
| Мобильное приложение | React Native (Expo) | :8081 |
| Админ-панель | React (Vite) | :5173 |

---

## 🚀 Быстрый старт (локальная разработка)

### Предварительные требования
- Docker Desktop ≥ 24
- Node.js 20 LTS
- npm ≥ 9

### 1. Бэкенд
```bash
cd backend
cp .env.example .env          # заполните значения
docker compose up -d          # поднимает postgres + redis + api

# Применить миграции и загрузить seed-данные (только при первом запуске)
docker compose exec api npx prisma migrate deploy
docker compose exec api node src/seed/index.js
```

API доступен по адресу http://localhost:3000  
Проверка здоровья: http://localhost:3000/healthz

### 2. Мобильное приложение
```bash
cd mobile
npm install
npx expo start
```

### 3. Админ-панель
```bash
cd admin
npm install
npm run dev
```

---

## 🐳 Production-деплой

Подробные инструкции: [OPERATIONS.md](OPERATIONS.md)

```bash
cd backend
mkdir -p secrets
echo -n "<strong-jwt-secret>" > secrets/jwt_secret.txt
echo -n "<strong-refresh-secret>" > secrets/jwt_refresh_secret.txt
chmod 600 secrets/*.txt

cp .env.example .env.prod   # заполните POSTGRES_PASSWORD, ALLOWED_ORIGINS, SENTRY_DSN

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

---

### Тестовые аккаунты (seed)
| Роль | Телефон | ПИН |
|------|---------|-----|
| Клиент (Gold) | +79001234567 | 1234 |
| Клиент (Silver) | +79009876543 | 1234 |
| Админ | +79000000000 | 0000 |

---

## 📁 Структура проекта

```
mtbbank-app/
├── backend/                   # API + Docker
│   ├── Dockerfile             # Multi-stage: builder → runtime (node:20-alpine)
│   ├── docker-compose.yml     # Dev: postgres + redis + api (hot-reload)
│   ├── docker-compose.prod.yml# Prod: с healthchecks, restart, Docker secrets
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── MIGRATIONS.md      # Expand-then-contract + CONCURRENT index policy
│   └── src/
├── mobile/                    # React Native (Expo)
│   └── eas.json               # preview + production EAS profiles
├── admin/                     # Админ-панель (Vite + React)
├── docs/
│   ├── adr/
│   │   └── ADR-001-no-csrf-middleware.md
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── CARD_SYSTEM.md
├── OPERATIONS.md              # Single-VPS ops guide
└── README.md
```

---

## 📱 Экраны приложения

1. **Главная** — баланс, карта, быстрые действия, последние операции
2. **Аналитика** — диаграммы расходов, подписки, лимиты трат
3. **Платежи** — категории оплаты, запланированные платежи
4. **Карточки** — активная колода, инвентарь, квесты, конвертация в MB
5. **Профиль** — настройки, безопасность, MB баллы

---

## 📖 Документация

- [API Reference](docs/API.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Система карточек](docs/CARD_SYSTEM.md)
- [Операционное руководство](OPERATIONS.md)
- [Политика миграций БД](backend/prisma/MIGRATIONS.md)
- [ADR-001: No CSRF middleware](docs/adr/ADR-001-no-csrf-middleware.md)

---

## 🤖 Android APK (EAS Build)

```bash
cd mobile
# Preview (APK, internal distribution)
npx eas build -p android --profile preview

# Production (store-ready APK)
npx eas build -p android --profile production
```

CI использует секрет `EXPO_TOKEN`. `EXPO_PUBLIC_*` переменные содержат только публичные значения (Sentry DSN, API URL). Секреты (`JWT_SECRET`, `SENTRY_AUTH_TOKEN`) никогда не попадают в артефакт сборки.

Дизайн: **Pristine Vault** — Manrope, Electric Blue (#4F8EF7), Gold (#fdcf49), glassmorphism
