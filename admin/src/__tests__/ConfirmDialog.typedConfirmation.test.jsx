// Phase 4.5 / 04.5-01 / Task 5 — vitest coverage for ConfirmDialog's
// typed-confirmation extension (UI-SPEC §"Hard-delete typed-confirmation").
//
// Behaviors pinned (matches plan <behavior> list 1-7):
//   1. baseline (no requireTypedConfirmation prop) — confirm enabled at render
//   2. typed input empty + requireTypedConfirmation truthy → confirm disabled
//   3. typed value matches → confirm enables and onConfirm fires once on click
//   4. typed value differs by 1 char → confirm stays disabled
//   5. closing then reopening resets typed input
//   6. Escape fires onCancel (preserved Phase-4 baseline)
//   7. typedPrompt prop overrides the default Russian prompt

import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmDialog } from '../components/ConfirmDialog';

afterEach(() => cleanup());

describe('ConfirmDialog — typed confirmation extension', () => {
  it('Test 1 — without requireTypedConfirmation, confirm enabled immediately', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Удалить?"
        message="Подтвердите."
        confirmLabel="Удалить"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    const btn = screen.getByRole('button', { name: /удалить$/i });
    expect(btn.disabled).toBe(false);
  });

  it('Test 2 — with requireTypedConfirmation set, empty input keeps confirm disabled', () => {
    render(
      <ConfirmDialog
        open
        title="Удалить пользователя навсегда?"
        confirmLabel="Удалить навсегда"
        requireTypedConfirmation="+79991234567"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const btn = screen.getByRole('button', { name: /удалить навсегда/i });
    expect(btn.disabled).toBe(true);
  });

  it('Test 3 — typing the exact value enables confirm; click fires onConfirm once', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Удалить?"
        confirmLabel="Удалить навсегда"
        requireTypedConfirmation="+79991234567"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    const input = screen.getByLabelText('Введите подтверждение');
    fireEvent.change(input, { target: { value: '+79991234567' } });
    const btn = screen.getByRole('button', { name: /удалить навсегда/i });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Test 4 — off-by-one digit keeps confirm disabled', () => {
    render(
      <ConfirmDialog
        open
        title="Удалить?"
        confirmLabel="Удалить навсегда"
        requireTypedConfirmation="+79991234567"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const input = screen.getByLabelText('Введите подтверждение');
    fireEvent.change(input, { target: { value: '+79991234566' } });
    const btn = screen.getByRole('button', { name: /удалить навсегда/i });
    expect(btn.disabled).toBe(true);
  });

  it('Test 5 — closing and reopening resets the typed input', () => {
    function Wrapper() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button data-testid="reopen" onClick={() => setOpen((o) => !o)}>toggle</button>
          <ConfirmDialog
            open={open}
            title="Удалить?"
            confirmLabel="Удалить навсегда"
            requireTypedConfirmation="+79991234567"
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        </>
      );
    }
    render(<Wrapper />);
    const input1 = screen.getByLabelText('Введите подтверждение');
    fireEvent.change(input1, { target: { value: '+79991234567' } });
    expect(input1.value).toBe('+79991234567');

    // Close
    fireEvent.click(screen.getByTestId('reopen'));
    // Reopen
    fireEvent.click(screen.getByTestId('reopen'));

    const input2 = screen.getByLabelText('Введите подтверждение');
    expect(input2.value).toBe('');
  });

  it('Test 6 — Escape fires onCancel (Phase-4 baseline preserved)', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Удалить?"
        confirmLabel="Удалить"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Test 7 — typedPrompt prop overrides the default Russian prompt', () => {
    const customPrompt = 'Введите код DELETE-1234, чтобы подтвердить:';
    render(
      <ConfirmDialog
        open
        title="Удалить?"
        confirmLabel="Удалить навсегда"
        requireTypedConfirmation="DELETE-1234"
        typedPrompt={customPrompt}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(customPrompt)).toBeTruthy();

    // Default fallback (Test 7b — prove the default prompt is used when no override)
    cleanup();
    render(
      <ConfirmDialog
        open
        title="Удалить?"
        confirmLabel="Удалить навсегда"
        requireTypedConfirmation="+79991234567"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(
      screen.getByText('Введите +79991234567 для подтверждения:')
    ).toBeTruthy();
  });
});
