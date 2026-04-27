# Phase 04.5 deferred items

## Plan 04.5-06 deferred items (pre-existing, out of scope)

- `admin/src/__tests__/AccountsPage.test.jsx:71` — `expect(typeof fireEvent).toBe('object')` fails because @testing-library/react now exports `fireEvent` as a function. Pre-existing from Plan 04.5-02; not caused by Plan 6 changes. Triage to a follow-up admin-tests cleanup pass.
- `admin/src/__tests__/UsersPage.hardDelete.test.jsx` Test 10 (App.jsx import compile smoke) — 5000ms test timeout when importing the admin App.jsx tree. Pre-existing from Plan 04.5-05; not caused by Plan 6 changes. Triage to admin-tests cleanup.

Both leave 137/143 admin vitest tests green. Plan 6's three new tests (admin-audit-rollback enumeration, ConfirmDialog typed-confirmation flows, admin-spa-vitest-coverage meta) all green.
