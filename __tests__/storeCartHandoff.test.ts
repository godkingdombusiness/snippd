import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('StoreCartHandoffCard launch-safe contract', () => {
  it('uses safe handoff copy and does not claim retailer cart automation', () => {
    const component = read('src/components/StoreCartHandoffCard.js');

    expect(component).toContain('Snippd built your plan. Your store still handles checkout.');
    expect(component).toContain('Tap each item to add it in your store app.');
    expect(component).not.toMatch(/automatically adds/i);
    expect(component).not.toMatch(/auto-add/i);
  });

  it('supports item, coupon, search, hub, and store-level handoff actions', () => {
    const component = read('src/components/StoreCartHandoffCard.js');

    [
      'item_deep_link',
      'coupon_deep_link',
      'retailer_search_url',
      'Open coupon page',
      'Open Publix',
      'Open Dollar General',
      'Open Kroger',
      'Open Walmart',
    ].forEach((needle) => expect(component).toContain(needle));
  });

  it('tracks the requested handoff analytics events', () => {
    const component = read('src/components/StoreCartHandoffCard.js');

    [
      'cart_handoff_started',
      'item_link_opened',
      'coupon_link_opened',
      'fallback_search_opened',
      'store_checkout_opened',
    ].forEach((eventName) => expect(component).toContain(eventName));
  });

  it('renders under each CartScreen store section without removing coupon clipping', () => {
    const cartScreen = read('screens/CartScreen.js');

    expect(cartScreen).toContain("import StoreCartHandoffCard from '../src/components/StoreCartHandoffCard'");
    expect(cartScreen).toContain('<StoreCartHandoffCard');
    expect(cartScreen).toContain("navigation.navigate('CouponClipping'");
  });
});
