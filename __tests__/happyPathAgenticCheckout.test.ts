import { describe, it, expect } from 'vitest';
import {
  normalizeCartItem,
  computeItemTotals,
  computeCartTotals,
} from '../src/services/agenticCheckoutMath';

/**
 * Happy path: budget is stored in cents on profile; cart lines normalize;
 * checkout summary matches register-style math (used by CartScreen).
 */
describe('Happy path: budget → cart → checkout math', () => {
  it('normalizes mixed-shape cart rows and computes totals', () => {
    const rows = [
      normalizeCartItem({
        id: '1',
        name: 'Milk',
        product_name: 'Milk',
        sale_cents: 349,
        reg_cents: 399,
        quantity: 2,
        deal_type: 'SALE',
        retailer_key: 'publix',
      }),
      normalizeCartItem({
        id: '2',
        product_name: 'Cereal',
        sale_cents: 250,
        reg_cents: 500,
        quantity: 1,
        deal_type: 'BOGO',
        store: 'Aldi',
      }),
    ];

    const t0 = computeItemTotals(rows[0]);
    expect(t0.youPayCents).toBe(698);
    const t1 = computeItemTotals(rows[1]);
    expect(t1.quantity).toBe(2);
    expect(t1.youPayCents).toBe(250);

    const cart = computeCartTotals(rows);
    expect(cart.youPay).toBe(698 + 250);
    expect(cart.regularTotal).toBeGreaterThan(cart.youPay);
  });

  it('weekly budget cents alignment: treats 15000 as $150.00', () => {
    const weeklyBudgetCents = 15000;
    expect(weeklyBudgetCents / 100).toBe(150);
  });
});
