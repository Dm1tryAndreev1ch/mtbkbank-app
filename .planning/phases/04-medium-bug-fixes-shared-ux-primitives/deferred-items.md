## 04-02 deferred

- backend/tests/integration/redis-failure-fallback.test.js — "Redis 'error' event emits warn + Sentry breadcrumb (transition only, idempotent)" fails (firstCount === 0). Pre-existing, unrelated to 04-02 scope. Independent breadcrumb-spy infrastructure issue. Out of scope per the rule.
