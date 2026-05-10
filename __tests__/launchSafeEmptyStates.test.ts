import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('launch-safe empty states', () => {
  it('keeps critical missing-data copy and CTAs in launch screens', () => {
    const home = read('screens/HomeScreen.js');
    const weekly = read('screens/WeeklyPlanScreen.js');
    const discover = read('screens/DiscoverScreen.js');
    const wealth = read('screens/WealthMomentumScreen.js');
    const cartOptions = read('screens/CartOptionsScreen.js');
    const chefStash = read('screens/ChefStashScreen.js');
    const coupons = read('screens/CouponClippingScreen.js');

    expect(home).toContain('Your weekly deal engine is warming up');
    expect(home).toContain('Build profile');
    expect(home).toContain('Add grocery budget');
    expect(weekly).toContain('No verified stacks for your stores yet.');
    expect(weekly).toContain('app_home_feed has no active stack rows');
    expect(discover).toContain('app_home_feed and stack_candidates');
    expect(wealth).toContain('Needs receipt history');
    expect(wealth).toContain('verified receipt history');
    expect(cartOptions).toContain('Start manual cart');
    expect(chefStash).toContain('normalized_offers');
    expect(coupons).toContain('No item-level coupon links yet');
    expect(coupons).toContain('retailer search or coupon hub');
  });

  it('keeps Discover navigation mounted for existing callers', () => {
    const app = read('App.js');

    expect(app).toContain("name: 'DiscoverTab'");
    expect(app).toContain('<DiscoverStackNav.Screen name="ShoppingList"');
  });
});
