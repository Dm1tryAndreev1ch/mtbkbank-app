# ADR-001: No CSRF Middleware

**Status**: Accepted  
**Date**: 2026-04-28 (written in Phase 2; recorded in Phase 8)  
**Deciders**: Backend lead  

---

## Контекст

МТ-Банк API используется двумя клиентами:

1. **Mobile (React Native / Expo)** — не является браузерным приложением; CSRF-атаки против него невозможны по определению (нет автоматической отправки cookies браузером).
2. **Admin (React SPA, Vite)** — браузерное приложение, потенциально подверженное CSRF.

Традиционный CSRF-вектор требует, чтобы браузер автоматически прикреплял учётные данные (cookies) к cross-site запросам. Если аутентификация реализована через Bearer-токены в заголовке `Authorization`, а токен хранится в `localStorage` (а не в `httpOnly` cookie), браузер **не отправляет** его автоматически.

---

## Решение

CSRF-middleware (`csurf` или аналог) **не устанавливается**.

Аутентификация построена на:
- `Authorization: Bearer <jwt>` header — токен хранится в `localStorage` на стороне admin/mobile.
- Refresh-токен ротируется при каждом использовании.

---

## Обоснование

| Фактор | Вывод |
|---|---|
| Bearer + localStorage | Браузер не отправляет `localStorage` автоматически в cross-site запросах → CSRF невозможен |
| Same-site fetch | Атака требует, чтобы вредоносный сайт мог сделать запрос с токеном — но токен недоступен из другого origin |
| `csurf` deprecated | Пакет официально устарел (npm); его использование создаёт ложное чувство безопасности |
| Double-submit cookie | Требует cookies — противоречит архитектурному выбору |

---

## Меры защиты (вместо CSRF-токена)

1. **CORS allowlist** (`SEC-02`) — только явно разрешённые origins получают ACAO-заголовок; остальные получают 403.
2. **`Authorization: Bearer` header** — токен передаётся только вручную, браузер не прикрепляет его автоматически.
3. **Content-Security-Policy** (`DEPLOY-07`) — предотвращает выполнение инжектированных скриптов, которые могли бы читать `localStorage`.
4. **`SameSite=Strict`** на будущих cookies (если admin перейдёт на cookie-аутентификацию).

---

## Риски и принятые допущения

- Если admin-приложение когда-либо переключится на `httpOnly` cookie для хранения токенов, это решение нужно пересмотреть и добавить CSRF-защиту (double-submit cookie или synchronizer token pattern).
- XSS в admin SPA может скомпрометировать `localStorage`. Митигация: CSP (DEPLOY-07) + строгий Helmet + input sanitization.

---

## Путь к пересмотру (v1.1+)

Если admin-панель перейдёт на cookie-аутентификацию:

1. Установить `csurf`-альтернативу (например, `csrf-csrf`).
2. Добавить `SameSite=Strict; Secure; HttpOnly` к refresh-cookie.
3. Обновить этот ADR статусом **Superseded**.
