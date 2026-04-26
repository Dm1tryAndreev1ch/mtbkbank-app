// Phase 4 / 04-04 / A-M4 — SkeletonRow renders correct row × column matrix.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkeletonRow } from '../components/SkeletonRow';

describe('SkeletonRow', () => {
  it('renders explicit rows × columns', () => {
    const { container } = render(
      <table>
        <tbody>
          <SkeletonRow columns={4} rows={3} />
        </tbody>
      </table>
    );
    const rows = container.querySelectorAll('tr.admin-skeleton-row');
    expect(rows.length).toBe(3);
    rows.forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      expect(tds.length).toBe(4);
      tds.forEach((td) => {
        const block = td.querySelector('div.admin-skeleton-block');
        expect(block).not.toBeNull();
      });
    });
  });

  it('defaults to 5 rows × 5 columns', () => {
    const { container } = render(
      <table>
        <tbody>
          <SkeletonRow />
        </tbody>
      </table>
    );
    const rows = container.querySelectorAll('tr.admin-skeleton-row');
    expect(rows.length).toBe(5);
    expect(rows[0].querySelectorAll('td').length).toBe(5);
  });
});
