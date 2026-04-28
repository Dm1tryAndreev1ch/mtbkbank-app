# OPERATIONS — MT-Банк Production Runbook

Этот документ описывает всё необходимое для эксплуатации MT-Банк на одном VPS.

---

## Содержание

1. [Требования к хосту](#1-требования-к-хосту)
2. [Деплой-процедура](#2-деплой-процедура)
3. [Переменные окружения](#3-переменные-окружения)
4. [Docker restart policy](#4-docker-restart-policy)
5. [Healthcheck и мониторинг](#5-healthcheck-и-мониторинг)
6. [Redis — разделение клиентов](#6-redis--разделение-клиентов)
7. [HP-tick cron — single-replica constraint](#7-hp-tick-cron--single-replica-constraint)
8. [Оценка объёма логов](#8-оценка-объёма-логов)
9. [Rollback-процедура](#9-rollback-процедура)

---

## 1. Требования к хосту

| Ресурс | Минимум | Рекомендовано |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Диск | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Docker | ≥ 24.0 | latest stable |
| docker compose | ≥ 2.20 | latest stable |

---

## 2. Деплой-процедура

### Первый деплой

```bash
# 1. Клонировать репо
git clone https://github.com/Dm1tryAndreev1ch/gm-bank-app.git
cd gm-bank-app/backend

# 2. Создать файлы секретов (никогда не коммить)
mkdir -p secrets
echo -n "$(openssl rand -hex 32)" > secrets/jwt_secret.txt
echo -n "$(openssl rand -hex 32)" > secrets/jwt_refresh_secret.txt
chmod 600 secrets/*.txt

# 3. Переменные окружения
cp .env.example .env.prod
# Отредактируйте .env.prod:
#   POSTGRES_PASSWORD=<strong-password>
#   ALLOWED_ORIGINS=https://admin.yourdomain.com
#   SENTRY_DSN=https://...
#   LOG_LEVEL=info

# 4. Собрать и запустить
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 5. Применить миграции БД (один раз)
#    Важно: миграции НЕ запускаются автоматически при старте контейнера
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# 6. Проверка
curl http://localhost:3000/healthz   # → {"status":"ok"}
```

### Обновление

```bash
cd gm-bank-app/backend
git pull

# Пересобрать и перезапустить только api
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --build --no-deps api

# Применить новые миграции
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Сервис получает SIGTERM → `closeWithGrace` дренирует in-flight запросы, закрывает
сокеты Socket.IO, сбрасывает cron-тик, закрывает Prisma и Redis в течение ≤10с.

---

## 3. Переменные окружения

| Переменная | Где задаётся | Описание |
|---|---|---|
| `JWT_SECRET` | Docker secret (`secrets/jwt_secret.txt`) | Подпись access-токенов |
| `JWT_REFRESH_SECRET` | Docker secret (`secrets/jwt_refresh_secret.txt`) | Подпись refresh-токенов |
| `POSTGRES_PASSWORD` | `.env.prod` | Пароль Postgres |
| `DATABASE_URL` | строится в `docker-compose.prod.yml` | Строка подключения Prisma |
| `REDIS_URL` | `docker-compose.prod.yml` | `redis://redis:6379` |
| `ALLOWED_ORIGINS` | `.env.prod` | CORS allowlist (comma-separated) |
| `SENTRY_DSN` | `.env.prod` | Backend Sentry DSN (публичный) |
| `LOG_LEVEL` | `.env.prod` | `info` (prod), `debug` (staging) |
| `ACTIVE_DECK_HP_TICK_MS` | `.env.prod` (необязат.) | Интервал HP-тика, умолч. 60000мс |

> **Никогда** не помещайте `JWT_SECRET`, `JWT_REFRESH_SECRET` или `SENTRY_AUTH_TOKEN`
> напрямую в `environment:` контейнера — только через Docker secrets.

---

## 4. Docker restart policy

Все сервисы в `docker-compose.prod.yml` имеют `restart: unless-stopped`.

- `unless-stopped` — перезапускается при падении ИЛИ перезагрузке хоста.
- `always` не используется, чтобы избежать бесконечных петель при неверной конфигурации.
- Dev-оверлей (`docker-compose.dev.yml`) устанавливает `restart: "no"` — краши видны сразу.

---

## 5. Healthcheck и мониторинг

| Эндпоинт | Метод | Ответ OK | Назначение |
|---|---|---|---|
| `/healthz` | GET | `200 {status:"ok"}` | Liveness (Docker healthcheck) |
| `/readyz` | GET | `200 {status:"ready"}` | Readiness (DB + Redis ping) |
| `/version` | GET | `200 {version,commit}` | Версия деплоя |

Docker healthcheck API: интервал 30s, timeout 5s, 3 retries, start_period 15s.

Health-эндпоинты подавлены на уровне `silent` в pino-http и не попадают в лог.

---

## 6. Redis — разделение клиентов

Бэкенд использует **три логически отдельных** Redis-клиента на одном экземпляре Redis:

| Клиент | Модуль | Назначение |
|---|---|---|
| **Cache** | `src/cache/index.js` | LRU-кэш (admin role, card lists и др.) |
| **Rate-limiter** | `src/middleware/authRateLimits.js` | Счётчики rate-limit (login, register, refresh, admin) |
| **Future Socket.IO adapter** | не создан в v1.0 | Зарезервирован для `@socket.io/redis-adapter` |

При недоступности Redis: cache-miss degradation (запросы идут в БД),
rate-limiter → fail-open (лимиты не применяются), HP-tick leader-election → `true`.

---

## 7. HP-tick cron — single-replica constraint

**Важно**: HP-тик (`setInterval` в `bootRuntime`) должен выполняться **только в одном процессе**.

- В v1.0 поддерживается **ровно один** работающий контейнер `api`.
- Leader-election через Redis SET NX (`lock:hp-tick`, TTL = tickMs × 2) защищает от двойного срабатывания при blue-green деплое.
- **Дрейф HP после перезапуска**: тик возобновляется сразу. Карты, HP которых должно
  было уменьшиться в период простоя, получат декремент на следующем тике — не более
  одного шага (идемпотентная логика в `tickActiveDeckCardHealth`).
- Для нескольких реплик: подключите `@socket.io/redis-adapter` и перенесите HP-тик в отдельный worker.

---

## 8. Оценка объёма логов

При 1000 RPS и уровне `info`:

| Источник | Строк/сек | Размер/сутки |
|---|---|---|
| HTTP access log (pino-http) | ~1000 | ~500 MB |
| HP-tick (1 раз/60s) | 0.017 | < 1 MB |
| Ошибки, warnings | < 1 | negligible |
| **Итого** | ~1000 | **~500 MB/сутки** |

Рекомендуется logrotate или агрегация (Loki, Datadog) при > 100 RPS.

---

## 9. Rollback-процедура

```bash
# Откат кода
git checkout <prev-tag>
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --build --no-deps api

# Откат миграций БД (если нужно)
# Prisma не поддерживает down-миграции автоматически.
# Следуйте expand-then-contract политике: backend/prisma/MIGRATIONS.md
```

### Если миграция упала с P3009

```bash
# Посмотреть какая разано упала
docker compose -f docker-compose.prod.yml logs api | grep 'migration started'

# Вариант A: SQL выполнился
docker compose -f docker-compose.prod.yml exec api \
  npx prisma migrate resolve --applied <migration_name>

# Вариант B: SQL не выполнился
docker compose -f docker-compose.prod.yml exec api \
  npx prisma migrate resolve --rolled-back <migration_name>

# Затем повторить
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```
