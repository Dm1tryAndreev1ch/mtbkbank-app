// Phase 4 / 04-04 / A-M1 / A-M3 — useZodForm onBlur validation contract.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { z } from 'zod';
import { useZodForm, mapZodMessage } from '../lib/useZodForm';

function TestForm({ schema, initial }) {
  const { values, errors, setField, blurField, submit } = useZodForm(schema, initial);
  return (
    <form onSubmit={submit(() => {})}>
      <input
        data-testid="name"
        value={values.name ?? ''}
        onChange={(e) => setField('name', e.target.value)}
        onBlur={() => blurField('name')}
      />
      {errors.name ? <small data-testid="err-name">{errors.name}</small> : null}
      <input
        data-testid="amount"
        value={values.amount ?? ''}
        onChange={(e) => setField('amount', e.target.value)}
        onBlur={() => blurField('amount')}
      />
      {errors.amount ? <small data-testid="err-amount">{errors.amount}</small> : null}
      <button type="submit">Сохранить</button>
    </form>
  );
}

describe('useZodForm — Russian copy + onBlur', () => {
  const schema = z.object({
    name: z.string().min(2).max(80),
    amount: z.coerce.number().min(0),
  });

  it('reports "Минимум 2 символов" on too-short string after blur', () => {
    render(<TestForm schema={schema} initial={{ name: 'X', amount: 0 }} />);
    fireEvent.blur(screen.getByTestId('name'));
    expect(screen.getByTestId('err-name').textContent).toBe('Минимум 2 символов');
  });

  it('reports "Значение не может быть отрицательным" on negative number after blur', () => {
    render(<TestForm schema={schema} initial={{ name: 'okay', amount: '-5' }} />);
    fireEvent.blur(screen.getByTestId('amount'));
    expect(screen.getByTestId('err-amount').textContent).toBe(
      'Значение не может быть отрицательным'
    );
  });

  it('reports "Введите число" when number coercion fails (NaN)', () => {
    render(<TestForm schema={schema} initial={{ name: 'okay', amount: 'abc' }} />);
    fireEvent.blur(screen.getByTestId('amount'));
    expect(screen.getByTestId('err-amount').textContent).toBe('Введите число');
  });

  it('clears the field error once the user starts editing again', () => {
    render(<TestForm schema={schema} initial={{ name: 'X', amount: 0 }} />);
    fireEvent.blur(screen.getByTestId('name'));
    expect(screen.getByTestId('err-name')).toBeTruthy();
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'XYZ' } });
    expect(screen.queryByTestId('err-name')).toBeNull();
  });

  it('mapZodMessage maps "Поле обязательно" for undefined input', () => {
    const r = z.object({ name: z.string() }).safeParse({});
    expect(mapZodMessage(r.error.issues[0])).toBe('Поле обязательно');
  });
});
