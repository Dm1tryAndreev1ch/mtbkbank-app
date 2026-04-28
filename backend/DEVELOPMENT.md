# Development Guide — Fresh Start

Полный цикл запуска бэкенда с нуля через Docker.

---

## Требования

| Инструмент | Версия |
|---|---|
| Docker | 24+ |
| Docker Compose | v2 (`docker compose`, не `docker-compose`) |
| Git | любая |

Node.js локально **не нужен** — всё собирается внутри контейнера.

---

## 1. Клонировать репо

```bash
git clone https://github.com/Dm1tryAndreev1ch/gm-bank-app.git
cd gm-bank-app/backend
```

---

## 2. Создать `.env`

```bash
cp .env.example .env
```

Для локального запуска через Docker значения менять не нужно — `docker-compose.yml` уже
передаёт все переменные через `environment:`. Файл `.env` нужен только если запускаете
`node` напрямую (без Docker).

---

## 3. Собрать и запустить контейнеры

```bash
docker compose up --build
```

Это запустит три сервиса:
- **postgres** — PostgreSQL 16, порт `5432`
- **redis** — Redis 7, порт `6379`
- **api** — Node.js приложение, порт `3000`

`api` стартует только после того, как postgres пройдёт healthcheck (`pg_isready`).

---

## 4. Применить миграции (обязательно, один раз)

> ⚠️ Миграции **не запускаются автоматически** при старте контейнера.
> Это сделано намеренно — автозапуск на каждый рестарт приводит к ошибке
> `P3009 failed migration` если контейнер упал в процессе.

В отдельном терминале, пока контейнеры запущены:

```bash
docker compose exec api npx prisma migrate deploy
```

Ожидаемый вывод:
```
Prisma schema loaded from prisma/schema.prisma
13 migrations found in prisma/migrations
13 migrations applied.
```

---

## 5. Проверить что всё работает

```bash
curl http://localhost:3000/healthz
# → {"status":"ok"}
```

---

## Пересборка после изменений кода

Файлы `src/` и `prisma/` примонтированы как volumes — изменения
подхватываются **без пересборки образа**. Если менялся `package.json`
или `Dockerfile`:

```bash
docker compose up --build
```

---

## Добавить новую миграцию

```bash
# Применить все ожидающие миграции
docker compose exec api npx prisma migrate deploy

# Или создать новую (из builder-контейнера)
docker compose exec api npx prisma migrate dev --name <migration_name>
```

---

## Полный сброс (clean slate)

Если база сломана, миграции в рассинхроне, или нужно начать с нуля:

```bash
# Остановить и удалить контейнеры + volumes (БД стирается!)
docker compose down -v

# Пересобрать образы и поднять заново
docker compose up --build

# Применить миграции
docker compose exec api npx prisma migrate deploy
```

> `down -v` удаляет `pgdata` и `redisdata` volumes — все данные БД будут потеряны.

---

## Если миграция упала с P3009

Это значит предыдущий запуск `migrate deploy` был прерван и оставил
запись `failed` в `_prisma_migrations`.

```bash
# 1. Посмотреть какая миграция упала (имя будет в логе api)
docker compose logs api | grep 'migration started'

# 2. Пометить как применённую (если SQL фактически выполнился)
docker compose exec api npx prisma migrate resolve \
  --applied <migration_name>

# 3. Или как откатанную (если SQL не выполнился)
docker compose exec api npx prisma migrate resolve \
  --rolled-back <migration_name>

# 4. Применить остальные
docker compose exec api npx prisma migrate deploy
```

Если не уверены — сделайте полный сброс (`down -v`) в dev-среде.

---

## Полезные команды

```bash
# Логи всех сервисов
docker compose logs -f

# Логи только api
docker compose logs -f api

# Зайти в контейнер api
docker compose exec api sh

# Статус миграций
docker compose exec api npx prisma migrate status

# Prisma Studio (браузерный просмотр БД)
docker compose exec api npx prisma studio
```
