export type CartLine = Record<string, unknown> & {
  sale_cents?: number;
  reg_cents?: number;
  quantity?: number;
  deal_type?: string;
};

/** Normalize a cart line from plan / discover / manual sources. */
export function normalizeCartItem(item: CartLine): CartLine {
  const derivedStore = item.store || item.retailer_key || item.retailer || 'publix';
  return {
    ...item,
    product_name: item.product_name || item.name || 'Item',
    quantity: Math.max(1, (item.quantity as number) || 1),
    checked: item.checked === true,
    store: String(derivedStore).toLowerCase().replace(/\s+/g, '_'),
  };
}

export function computeItemTotals(item: CartLine) {
  const normalized = normalizeCartItem(item);
  const isBogo = String(normalized.deal_type || '').toUpperCase() === 'BOGO';
  const quantity = isBogo ? Math.max(2, Number(normalized.quantity) || 1) : Math.max(1, Number(normalized.quantity) || 1);
  const saleCents = Number(normalized.sale_cents || 0);
  const regCents = Number(normalized.reg_cents || saleCents || 0);
  const youPayCents = isBogo ? saleCents : saleCents * quantity;
  const regularCents = regCents * quantity;

  return {
    quantity,
    youPayCents,
    regularCents,
    savingsCents: Math.max(0, regularCents - youPayCents),
  };
}

export function computeCartTotals(items: CartLine[]) {
  const totals = items.map(computeItemTotals);
  const youPay = totals.reduce((sum, item) => sum + item.youPayCents, 0);
  const regularTotal = totals.reduce((sum, item) => sum + item.regularCents, 0);

  return {
    youPay,
    regularTotal,
    savings: Math.max(0, regularTotal - youPay),
  };
}
