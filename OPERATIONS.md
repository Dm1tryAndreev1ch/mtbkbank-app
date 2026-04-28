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
|--------|---------|---------------|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Диск | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Docker | ≥ 24.0 | latest stable |
| docker compose | ≥ 2.20 | latest stable |

---

## 2. Деплой-процедура

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/Dm1tryAndreev1ch/gm-bank-app.git
cd gm-bank-app/backend

# 2. Создайте файлы секретов (никогда не коммитьте их)
mkdir -p secrets
echo -n "$(openssl rand -hex 32)" > secrets/jwt_secret.txt
echo -n "$(openssl rand -hex 32)" > secrets/jwt_refresh_secret.txt
chmod 600 secrets/*.txt

# 3. Заполните prod-окружение
cp .env.example .env.prod
# Отредактируйте .env.prod:
#   POSTGRES_PASSWORD=<strong-password>
#   ALLOWED_ORIGINS=https://admin.yourdomain.com
#   SENTRY_DSN=https://...
#   LOG_LEVEL=info

# 4. Соберите и запустите
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 5. Примените миграции БД
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# 6. Проверьте здоровье
curl http://localhost:3000/healthz
```

### Обновление (zero-downtime на одном VPS)

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --no-deps api
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Сервис получает SIGTERM → `closeWithGrace` ждёт до 10 секунд, дренирует in-flight запросы, закрывает Prisma и Redis, затем завершается. Новый контейнер стартует параллельно.

---

## 3. Переменные окружения

| Переменная | Где задаётся | Описание |
|---|---|---|
| `JWT_SECRET` | Docker secret (`secrets/jwt_secret.txt`) | Подпись access-токенов |
| `JWT_REFRESH_SECRET` | Docker secret (`secrets/jwt_refresh_secret.txt`) | Подпись refresh-токенов |
| `POSTGRES_PASSWORD` | `.env.prod` | Пароль Postgres |
| `DATABASE_URL` | `docker-compose.prod.yml` (строится из POSTGRES_PASSWORD) | Строка подключения Prisma |
| `REDIS_URL` | `docker-compose.prod.yml` | `redis://redis:6379` |
| `ALLOWED_ORIGINS` | `.env.prod` | Comma-separated список разрешённых CORS-источников |
| `SENTRY_DSN` | `.env.prod` | Backend Sentry DSN (публичный, без auth token) |
| `LOG_LEVEL` | `.env.prod` | `info` (prod), `debug` (staging) |
| `ACTIVE_DECK_HP_TICK_MS` | `.env.prod` (optional) | Интервал HP-тика, по умолчанию 60000 мс |

> **Никогда** не помещайте `JWT_SECRET`, `JWT_REFRESH_SECRET` или `SENTRY_AUTH_TOKEN` в env-переменные контейнера напрямую — только через Docker secrets.

---

## 4. Docker restart policy

Все сервисы в `docker-compose.prod.yml` имеют `restart: unless-stopped`.

- `unless-stopped` — контейнер перезапускается при падении ИЛИ перезагрузке хоста, но **не** перезапускается после `docker compose stop` (ручная остановка).
- `always` не используется, чтобы избежать бесконечных петель при неверной конфигурации.

---

## 5. Healthcheck и мониторинг

| Эндпоинт | Метод | Ответ OK | Назначение |
|---|---|---|---|
| `/healthz` | GET | `200 {status:"ok"}` | Liveness (Docker healthcheck) |
| `/readyz` | GET | `200 {status:"ready"}` | Readiness (DB + Redis ping) |
| `/version` | GET | `200 {version,commit}` | Версия деплоя |

Docker healthcheck API: интервал 30s, timeout 5s, 3 retries, start_period 15s.

---

## 6. Redis — разделение клиентов

Бэкенд использует **три логически отдельных** Redis-клиента на одном экземпляре Redis:

| Клиент | Переменная/модуль | Назначение |
|---|---|---|
| **Cache** | `src/cache/index.js` (`redisClient`) | LRU-кэш (admin role, card lists и др.) |
| **Rate-limiter** | `src/middleware/authRateLimits.js` (отдельный `createClient`) | Счётчики rate-limit (login, register, refresh, admin) |
| **Future Socket.IO adapter** | не создан в v1.0 | Зарезервирован для горизонтального масштабирования Socket.IO через `@socket.io/redis-adapter` |

> При Redis-недоступности: cache-miss degradation (запросы идут в БД), rate-limiter переходит в fail-open режим (лимиты не применяются), HP-tick leader-election возвращает `true` (единственный процесс продолжает тикать).

---

## 7. HP-tick cron — single-replica constraint

**Важно**: HP-тик (`setInterval` в `bootRuntime`) должен выполняться **только в одном процессе**.

- В v1.0 поддерживается **ровно один** работающий контейнер `api`.
- Leader-election через Redis SET NX (`lock:hp-tick`, TTL = tickMs × 2) защищает от двойного срабатывания при ручном blue-green деплое.
- **Дрейф HP после перезапуска**: при перезапуске контейнера тик возобновляется сразу. Карты, здоровье которых должно было уменьшиться в период простоя, получат декремент на следующем тике — не более одного шага (идемпотентная логика в `tickActiveDeckCardHealth`).
- Если нужно запустить 2+ реплик, подключите `@socket.io/redis-adapter` и перенесите HP-тик в отдельный worker-процесс с Redis-distributed lock.

---

## 8. Оценка объёма логов

При 1000 RPS и уровне `info`:

| Источник | Строк/сек | Размер/сутки |
|---|---|---|
| HTTP access log (pino-http) | ~1000 | ~500 MB |
| HP-tick (1 раз/60s) | 0.017 | < 1 MB |
| Ошибки, warnings | < 1 | negligible |
| **Итого** | ~1000 | **~500 MB/сутки** |

Рекомендуется настроить logrotate или отправку в log-агрегатор (Loki, Datadog) при нагрузке > 100 RPS.

Health-эндпоинты (`/healthz`, `/readyz`, `/version`) подавлены на уровне `silent` в pino-http и **не попадают в лог**.

---

## 9. Rollback-процедура

```bash
# Откат к предыдущему образу
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps api --scale api=0
docker tag <previous-image-id> mtbbank-api:rollback
# ... или git checkout <prev-tag> && docker compose ... up -d --build

# Откат миграций БД (если нужно)
# Prisma не поддерживает автоматический down-migration.
# Следуйте expand-then-contract политике: см. backend/prisma/MIGRATIONS.md
```
