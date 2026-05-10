import { describe, expect, it } from 'vitest';
import {
  getRetailerCouponHub,
  getRetailerCouponSearchUrl,
  normalizeRetailerKey,
  resolveCouponActivationLink,
} from '../src/lib/retailerCouponLinks';

describe('retailer coupon activation links', () => {
  it('normalizes retailer names used by stacks', () => {
    expect(normalizeRetailerKey('Dollar General')).toBe('dollar_general');
    expect(normalizeRetailerKey('dollar_general')).toBe('dollar_general');
    expect(normalizeRetailerKey('Publix')).toBe('publix');
  });

  it('uses official hubs for Dollar General and Publix when no exact evidence exists', () => {
    expect(getRetailerCouponHub('Dollar General')).toBe(
      'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0',
    );
    expect(getRetailerCouponHub('Publix')).toBe('https://www.publix.com/savings/digital-coupons');
  });

  it('prefers exact official coupon evidence over retailer hubs', () => {
    const link = resolveCouponActivationLink(
      { official_coupon_url: 'https://www.dollargeneral.com/deals/coupons/save-12345' },
      'Dollar General',
    );

    expect(link.status).toBe('evidence_exact');
    expect(link.linkType).toBe('item');
    expect(link.url).toBe('https://www.dollargeneral.com/deals/coupons/save-12345');
    expect(link.label).toBe('Open Official Coupon');
  });

  it('falls back to retailer search before hub-only links', () => {
    expect(getRetailerCouponSearchUrl('Kroger', 'Tide Pods')).toBe(
      'https://www.kroger.com/savings/cl/coupons?searchTerm=Tide%20Pods',
    );

    const link = resolveCouponActivationLink({ product_name: 'Tide Pods' }, 'Kroger');
    expect(link.status).toBe('retailer_search');
    expect(link.linkType).toBe('search');
    expect(link.source).toBe('retailer_search');
    expect(link.confidence).toBe(0.7);
  });

  it('marks hub-level fallback links as hub', () => {
    const link = resolveCouponActivationLink({}, 'Target');
    expect(link.status).toBe('official_hub');
    expect(link.linkType).toBe('hub');
    expect(link.url).toBe('https://www.target.com/circle');
  });
});
