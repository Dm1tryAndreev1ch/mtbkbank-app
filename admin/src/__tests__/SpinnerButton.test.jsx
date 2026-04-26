// Phase 4 / 04-04 / A-M2 — SpinnerButton loading + disabled + click semantics.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { SpinnerButton } from '../components/SpinnerButton';

describe('SpinnerButton', () => {
  it('loading=true → disabled, aria-label "Выполняется…", spinner present', () => {
    const { container } = render(<SpinnerButton loading>Сохранить</SpinnerButton>);
    const btn = container.querySelector('button');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Выполняется…');
    expect(container.querySelector('.admin-spinner')).not.toBeNull();
  });

  it('loading=false → not disabled, no aria-label, no spinner', () => {
    const { container } = render(<SpinnerButton>Сохранить</SpinnerButton>);
    const btn = container.querySelector('button');
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-label')).toBeNull();
    expect(container.querySelector('.admin-spinner')).toBeNull();
  });

  it('disabled prop passes through even when not loading', () => {
    const { container } = render(<SpinnerButton disabled>Сохранить</SpinnerButton>);
    expect(container.querySelector('button').disabled).toBe(true);
  });

  it('fires onClick when idle, swallows onClick when loading', () => {
    const onClick = vi.fn();
    const { rerender } = render(<SpinnerButton onClick={onClick}>Go</SpinnerButton>);
    fireEvent.click(screen.getByText('Go'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<SpinnerButton loading onClick={onClick}>Go</SpinnerButton>);
    // Disabled buttons in jsdom do not fire click; explicitly assert no extra call.
    fireEvent.click(screen.getByText('Go'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
