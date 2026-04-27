/**
 * Phase 4.5 / 04.5-06 / Task 3 — Roadmap Success Criterion 5.
 *
 * Typed-confirmation flow covering ≥3 representative destructive actions:
 *   1. USER_HARD_DELETE   — typed=phone   (mandatory per ADMIN-12)
 *   2. BANKCARD_DELETE    — typed=last4   (demo of optional typed-confirmation)
 *   3. QUEST_DELETE       — typed=УДАЛИТЬ (demo of optional typed-confirmation)
 *
 * Each flow asserts:
 *   (a) confirm button disabled until typed value matches exactly,
 *   (b) onConfirm fires exactly once on click after match,
 *   (c) typed input resets to empty when dialog reopens.
 */

import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmDialog } from '../components/ConfirmDialog';

afterEach(() => cleanup());

function renderTyped({
  value,
  prompt,
  confirmLabel = 'Удалить навсегда',
  onConfirm = vi.fn(),
  onCancel = vi.fn(),
}) {
  render(
    <ConfirmDialog
      open
      title="Подтвердите действие"
      message="…"
      confirmLabel={confirmLabel}
      cancelLabel="Отмена"
      destructive
      requireTypedConfirmation={value}
      typedPrompt={prompt}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  return { onConfirm, onCancel };
}

describe('Phase-4.5 SC-5 — typed-confirmation flows for ≥3 destructive actions', () => {
  it('USER_HARD_DELETE — typed=phone (mandatory)', () => {
    const phone = '+79991234567';
    const { onConfirm } = renderTyped({
      value: phone,
      prompt: `Введите номер телефона ${phone} для подтверждения:`,
      confirmLabel: 'Удалить навсегда',
    });

    const btn = screen.getByRole('button', { name: /удалить навсегда/i });
    expect(btn.disabled).toBe(true);

    const input = screen.getByLabelText('Введите подтверждение');

    // Close-but-no-match.
    fireEvent.change(input, { target: { value: '+79991234560' } });
    expect(btn.disabled).toBe(true);

    // Exact match enables confirm.
    fireEvent.change(input, { target: { value: phone } });
    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('BANKCARD_DELETE — typed=last4 (demo)', () => {
    const last4 = '1234';
    const { onConfirm } = renderTyped({
      value: last4,
      prompt: 'Введите последние 4 цифры карты для подтверждения:',
      confirmLabel: 'Удалить карту',
    });

    const btn = screen.getByRole('button', { name: /удалить карту/i });
    expect(btn.disabled).toBe(true);

    const input = screen.getByLabelText('Введите подтверждение');

    fireEvent.change(input, { target: { value: '1230' } });
    expect(btn.disabled).toBe(true);

    fireEvent.change(input, { target: { value: last4 } });
    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('QUEST_DELETE — typed=УДАЛИТЬ (demo)', () => {
    const magic = 'УДАЛИТЬ';
    const { onConfirm } = renderTyped({
      value: magic,
      prompt: `Введите ${magic} для подтверждения:`,
      confirmLabel: 'Удалить квест',
    });

    const btn = screen.getByRole('button', { name: /удалить квест/i });
    expect(btn.disabled).toBe(true);

    const input = screen.getByLabelText('Введите подтверждение');

    // Lowercase does not match (case-sensitive).
    fireEvent.change(input, { target: { value: 'удалить' } });
    expect(btn.disabled).toBe(true);

    fireEvent.change(input, { target: { value: magic } });
    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('typed input resets when dialog reopens', () => {
    // Wrapper that toggles `open` so we can exercise the false→true reset.
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)} aria-label="reopen">
            reopen
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="close">
            close
          </button>
          <ConfirmDialog
            open={open}
            title="Подтвердите действие"
            confirmLabel="Удалить навсегда"
            destructive
            requireTypedConfirmation="+79991234567"
            typedPrompt="Введите номер телефона для подтверждения:"
            onConfirm={() => {}}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);

    const input = screen.getByLabelText('Введите подтверждение');
    fireEvent.change(input, { target: { value: '+79991234567' } });
    expect(input.value).toBe('+79991234567');

    // Close the dialog.
    fireEvent.click(screen.getByLabelText('close'));
    expect(screen.queryByLabelText('Введите подтверждение')).toBeNull();

    // Reopen — the input must be empty (false→true reset contract).
    fireEvent.click(screen.getByLabelText('reopen'));
    const reopened = screen.getByLabelText('Введите подтверждение');
    expect(reopened.value).toBe('');

    // Confirm button starts disabled again.
    const btn = screen.getByRole('button', { name: /удалить навсегда/i });
    expect(btn.disabled).toBe(true);
  });
});
