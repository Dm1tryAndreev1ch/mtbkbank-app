/**
 * Phase 4.5 / 04.5-05 / ADMIN-12 — UsersPage typed-confirmation hard-delete UI.
 *
 * The full UsersPage tree is gated behind LoginPage in App.jsx and deep-mocking
 * that gate is fragile (precedent: AccountsPage.test.jsx etc. all use compile-
 * smoke + isolated-component assertions). This file pins:
 *
 *   1. App.jsx renders both `Архивировать` and `Удалить навсегда` button copy.
 *   2. App.jsx contains the soft-delete confirm message verbatim.
 *   3. App.jsx contains the hard-delete confirm message verbatim, including
 *      "История обменов сохранится с обнулённой ссылкой".
 *   4. App.jsx wires the typed-confirmation prop with user.phone + the typed
 *      prompt copy.
 *   5. App.jsx fires DELETE with mode=soft / mode=hard via apiFetch path strings.
 *   6. Toast vocabulary: "Пользователь архивирован" / "Пользователь удалён".
 *   7. ConfirmDialog typed-confirmation behaviour (using the same props the
 *      UsersPage passes) — confirm disabled until input matches user.phone,
 *      enabled and onConfirm fires once after.
 *   8. ConfirmDialog typed input resets between opens.
 */

import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

import { ConfirmDialog } from '../components/ConfirmDialog';

afterEach(() => cleanup());

const APP_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'App.jsx'),
  'utf8'
);

describe('UsersPage hard-delete UI (ADMIN-12, Phase-4.5 04.5-05)', () => {
  it('Test 1 — App.jsx exposes both delete CTAs', () => {
    expect(APP_SRC).toContain('Архивировать');
    expect(APP_SRC).toContain('Удалить навсегда');
  });

  it('Test 2 — soft-delete confirm message verbatim per UI-SPEC', () => {
    expect(APP_SRC).toContain(
      'Пользователь будет архивирован. Вход будет запрещён, данные сохранятся.'
    );
    expect(APP_SRC).toContain('Архивировать пользователя');
  });

  it('Test 3 — hard-delete confirm message verbatim per UI-SPEC (incl. CardTrade SetNull note)', () => {
    expect(APP_SRC).toContain('Удалить пользователя навсегда?');
    expect(APP_SRC).toContain(
      'Будут удалены: счета, банковские карты, карты-коллекции, колоды, refresh-токены.'
    );
    expect(APP_SRC).toContain(
      'История обменов сохранится с обнулённой ссылкой. Действие необратимо.'
    );
  });

  it('Test 4 — typed-confirmation prop wired to user.phone with typedPrompt', () => {
    expect(APP_SRC).toContain('requireTypedConfirmation={confirm.user.phone}');
    expect(APP_SRC).toContain('Введите номер телефона ');
  });

  it('Test 5 — apiFetch fires DELETE with mode=soft and mode=hard', () => {
    expect(APP_SRC).toContain('/users/${id}?mode=soft');
    expect(APP_SRC).toContain('/users/${id}?mode=hard');
    expect(APP_SRC).toMatch(/method:\s*'DELETE'/);
  });

  it('Test 6 — toast vocabulary verbatim per UI-SPEC', () => {
    expect(APP_SRC).toContain("toastSuccess('Пользователь архивирован')");
    expect(APP_SRC).toContain("toastSuccess('Пользователь удалён')");
  });

  it('Test 7 — ConfirmDialog with the same props UsersPage passes: confirm disabled until typed phone matches', () => {
    const onConfirm = vi.fn();
    const phone = '+79991234567';
    render(
      <ConfirmDialog
        open
        title="Удалить пользователя навсегда?"
        message="Будут удалены: счета, банковские карты, карты-коллекции, колоды, refresh-токены. История обменов сохранится с обнулённой ссылкой. Действие необратимо."
        confirmLabel="Удалить навсегда"
        cancelLabel="Отмена"
        destructive
        requireTypedConfirmation={phone}
        typedPrompt={`Введите номер телефона ${phone} для подтверждения:`}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    const btn = screen.getByRole('button', { name: /удалить навсегда/i });
    expect(btn.disabled).toBe(true);

    const input = screen.getByLabelText('Введите подтверждение');
    fireEvent.change(input, { target: { value: '+79991234500' } });
    expect(btn.disabled).toBe(true);

    fireEvent.change(input, { target: { value: phone } });
    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // typedPrompt rendered.
    expect(
      screen.getByText(`Введите номер телефона ${phone} для подтверждения:`)
    ).toBeTruthy();
  });

  it('Test 8 — closing then reopening resets typed input', () => {
    const phone = '+79991234567';
    function Wrapper() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button data-testid="reopen" onClick={() => setOpen((o) => !o)}>toggle</button>
          <ConfirmDialog
            open={open}
            title="Удалить пользователя навсегда?"
            confirmLabel="Удалить навсегда"
            requireTypedConfirmation={phone}
            typedPrompt={`Введите номер телефона ${phone} для подтверждения:`}
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        </>
      );
    }
    render(<Wrapper />);
    const input1 = screen.getByLabelText('Введите подтверждение');
    fireEvent.change(input1, { target: { value: phone } });
    expect(input1.value).toBe(phone);
    // Close + reopen.
    fireEvent.click(screen.getByTestId('reopen'));
    fireEvent.click(screen.getByTestId('reopen'));
    const input2 = screen.getByLabelText('Введите подтверждение');
    expect(input2.value).toBe('');
  });

  it('Test 9 — App.jsx self-delete UI guard wired via currentAdminId comparison', () => {
    // Self-delete UI guard mirrors backend USER_SELF_DELETE_FORBIDDEN (T-04.5-05-02).
    expect(APP_SRC).toContain('currentAdminId');
    expect(APP_SRC).toContain('Невозможно удалить свой аккаунт');
  });

  it('Test 10 — App.jsx module imports succeed (compile smoke)', async () => {
    const mod = await import('../App.jsx');
    expect(mod.default).toBeTruthy();
  });
});
