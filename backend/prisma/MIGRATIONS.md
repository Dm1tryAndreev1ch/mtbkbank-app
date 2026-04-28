# Migrations Policy — MT-Банк Backend

Этот документ описывает правила работы с Prisma-миграциями в продакшн.

---

## Принципы

### 1. Expand-then-Contract

Все изменения схемы проходят через два этапа:

| Этап | Что делаем | Когда деплоим |
|---|---|---|
| **Expand** | Добавляем новое (колонку, индекс, таблицу) — обратно совместимо | Вместе с текущим релизом |
| **Contract** | Удаляем старое (deprecated колонку, таблицу) | Только после того, как все читатели обновлены |

Никогда не удаляйте колонку и не меняйте тип данных в одной миграции с добавлением нового кода, который эту колонку использует.

---

### 2. CREATE INDEX CONCURRENTLY — одна миграция на индекс

Правила для индексных миграций:

- Каждый `CREATE INDEX CONCURRENTLY` — **в отдельном файле миграции**.
- Каждый файл должен содержать аннотацию `-- prisma-disable-transaction` первой строкой.
- `CONCURRENTLY` нельзя выполнять внутри транзакции — без аннотации Prisma обернёт SQL в BEGIN/COMMIT и получит ошибку.
- `CONCURRENTLY` не берёт `ACCESS EXCLUSIVE` lock, поэтому таблица остаётся доступной для чтения/записи во время построения индекса.

**Пример правильного файла:**
```sql
-- prisma-disable-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_userId_createdAt_idx"
  ON "Transaction" ("userId", "createdAt" DESC);
```

**Нельзя:**
```sql
-- ❌ Несколько индексов в одном файле
-- prisma-disable-transaction
CREATE INDEX CONCURRENTLY ... ON "Transaction" (...);
CREATE INDEX CONCURRENTLY ... ON "Notification" (...);
```

---

### 3. Процедура создания миграции

```bash
# 1. Создать пустую миграцию
npx prisma migrate dev --create-only --name idx_transaction_user_created

# 2. Отредактировать сгенерированный SQL-файл:
#    - Добавить "-- prisma-disable-transaction" первой строкой
#    - Написать CREATE INDEX CONCURRENTLY ...

# 3. Применить
npx prisma migrate deploy
```

---

### 4. Rollback

Prisma не генерирует down-migrations автоматически. При необходимости отката:

1. **Индексы**: `DROP INDEX CONCURRENTLY IF EXISTS "<index_name>";` — выполнить вручную через psql или новой миграцией.
2. **Колонки (expand-only)**: создать новую миграцию, удаляющую добавленную колонку (contract-шаг).
3. **Данные**: использовать резервную копию pg_dump, сделанную перед деплоем.

> Перед каждым деплоем в продакшн: `pg_dump -Fc mtbbank > backup_$(date +%Y%m%d_%H%M%S).dump`

---

### 5. Существующие CONCURRENT-индексы

| Миграция | Таблица | Колонки | Тип |
|---|---|---|---|
| `20260427_idx_transaction_user_created` | `Transaction` | `(userId, createdAt DESC)` | BTREE CONCURRENT |
| `20260427_idx_notification_user_created` | `Notification` | `(userId, createdAt DESC)` | BTREE CONCURRENT |
| `20260427_idx_user_card_user` | `UserCard` | `(userId)` | BTREE CONCURRENT |
| `20260427_refresh_token_expires_at` | `User` | backfill `refreshTokenExpiresAt = createdAt + 30d` | data migration |
