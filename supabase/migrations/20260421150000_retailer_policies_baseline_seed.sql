-- Baseline "Known Truths" seed for public.retailer_policies.
--
-- Purpose: give the Stack_Architect a non-empty policy surface from minute one,
-- so it can reason about competitor coupon bridges, loyalty gates, rebate
-- stacking, BOGO quirks, and ad cycles BEFORE the Retailer_Policy_Curator
-- runs its first verification pass.
--
-- Conservative confidence scoring (0.50) + verified_by='baseline_seed' means
-- the Curator's `list_stale_retailer_policies()` will surface these for
-- verification, after which confidence climbs to 0.8-1.0 with a real
-- source_url + source_snippet.
--
-- Idempotent: uses ON CONFLICT DO NOTHING, so re-running never overwrites
-- Curator-verified rows.

-- Mark baseline rows as "verified" 180 days ago so they land in the Curator's
-- refresh queue immediately.
with baseline as (
  select
    s::text as store_id,
    pt::text as policy_type,
    pk::text as policy_key,
    vj::jsonb as value_json,
    summary::text,
    origin::text as source_url,
    '[BASELINE SEED — needs live verification]'::text as source_snippet,
    0.50::numeric as confidence,
    'baseline_seed'::text as verified_by,
    (now() - interval '180 days')::timestamptz as last_verified_at
  from (values

  -- =======================================================================
  -- WALMART
  -- =======================================================================
  ('walmart', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": true, "notes": "Manufacturer paper coupons accepted in-store."}',
   'Walmart accepts manufacturer coupons in-store.',
   'https://www.walmart.com/help/article/coupon-policy/'),
  ('walmart', 'coupon_acceptance', 'accepts_competitor_coupons',
   '{"accepts": false, "notes": "No competitor coupons accepted as of 2021 policy refresh."}',
   'Walmart does NOT accept competitor coupons.',
   'https://www.walmart.com/help/article/coupon-policy/'),
  ('walmart', 'coupon_acceptance', 'accepts_digital_coupons',
   '{"accepts": true, "notes": "Manufacturer digital coupons clip-to-Walmart-account via Walmart.com."}',
   'Walmart digital coupons via Walmart.com account.',
   'https://www.walmart.com/help/article/coupon-policy/'),
  ('walmart', 'price_match', 'scope',
   '{"in_store": false, "online": true, "notes": "Walmart ended in-store ad-match 2019; online price-adjust only in limited cases."}',
   'Walmart price match is effectively online-only.',
   'https://www.walmart.com/help/article/price-match-policy'),
  ('walmart', 'rebate_compat', 'apps',
   '{"ibotta": true, "fetch": true, "checkout51": true, "notes": "In-store via receipt scan."}',
   'Ibotta/Fetch/Checkout 51 all pay for Walmart via receipt.',
   'https://www.walmart.com'),

  -- =======================================================================
  -- ALDI
  -- =======================================================================
  ('aldi', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": false, "notes": "Aldi does not accept manufacturer or internet coupons."}',
   'Aldi does not accept manufacturer coupons.',
   'https://www.aldi.us/about-aldi/frequently-asked-questions/'),
  ('aldi', 'coupon_acceptance', 'accepts_internal_coupons',
   '{"accepts": true, "notes": "Aldi-issued email/app coupons only."}',
   'Aldi accepts only Aldi-issued coupons.',
   'https://www.aldi.us'),
  ('aldi', 'rewards_program', 'has_program',
   '{"has_program": false, "substitute": "Twice-as-Nice Guarantee (refund + replace on Aldi Finds/private label)."}',
   'No loyalty; Twice-as-Nice Guarantee.',
   'https://www.aldi.us/about-aldi/our-quality/twice-as-nice-guarantee/'),
  ('aldi', 'rebate_compat', 'apps',
   '{"ibotta": true, "fetch": true, "checkout51": true, "notes": "All three pay via receipt."}',
   'All three rebate apps pay for Aldi receipts.',
   'https://www.aldi.us'),
  ('aldi', 'ad_cycle', 'flip_day',
   '{"day_of_week": "Wednesday", "notes": "Aldi Finds (weekly ad) refresh each Wednesday in most regions."}',
   'Aldi Finds refresh Wednesday.',
   'https://www.aldi.us'),

  -- =======================================================================
  -- TARGET  (the Bridge Stack foundation)
  -- =======================================================================
  ('target', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": true, "notes": "Manufacturer coupons stack with Target Circle + a Cartwheel-era store coupon."}',
   'Target accepts manufacturer coupons.',
   'https://www.target.com/c/target-coupons-top-deals/-/N-5q0ga'),
  ('target', 'coupon_acceptance', 'accepts_competitor_coupons',
   '{"accepts": true, "accepts_from": ["cvs", "walgreens"], "categories": ["beauty", "pharmacy OTC"], "notes": "Historically Target accepts competitor store coupons for beauty at Guest Services discretion. VERIFY per store."}',
   'Target historically accepts CVS/Walgreens beauty coupons (store discretion).',
   'https://www.target.com'),
  ('target', 'coupon_stacking', 'allows_manufacturer_plus_store',
   '{"allows": true, "notes": "1 manufacturer + 1 Target Circle offer + 1 Target store coupon per item."}',
   'Target allows mfr + Target Circle + store coupon on same item.',
   'https://www.target.com'),
  ('target', 'rewards_program', 'circle',
   '{"name": "Target Circle", "free": true, "mechanics": "Digital offers + 1% earnings + RedCard 5% off."}',
   'Target Circle is free; RedCard adds 5% off.',
   'https://www.target.com/circle'),
  ('target', 'price_match', 'scope',
   '{"in_store": true, "online": true, "matches": ["amazon.com", "walmart.com", "local competitors"], "window_days": 14}',
   'Target matches Amazon/Walmart + adjusts within 14 days.',
   'https://help.target.com/help/subcategoryarticle?childcat=Price+Match+Guarantee&parentcat=Promotions'),
  ('target', 'rebate_compat', 'apps',
   '{"ibotta": true, "fetch": true, "checkout51": true}',
   'All three apps pay for Target.',
   'https://www.target.com'),

  -- =======================================================================
  -- PUBLIX  (the BOGO Kingdom)
  -- =======================================================================
  ('publix', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": true, "notes": "Manufacturer coupons accepted; stack with Publix store coupons."}',
   'Publix accepts manufacturer coupons + Publix store coupons.',
   'https://www.publix.com/savings/coupons/coupon-policy'),
  ('publix', 'coupon_acceptance', 'accepts_competitor_coupons',
   '{"accepts": true, "notes": "Publix accepts competitor store coupons at select locations (varies by region/store manager)."}',
   'Publix accepts competitor coupons (regional).',
   'https://www.publix.com/savings/coupons/coupon-policy'),
  ('publix', 'coupon_stacking', 'allows_manufacturer_plus_store',
   '{"allows": true, "notes": "One manufacturer + one Publix store coupon per item."}',
   'Publix allows manufacturer + store coupon stack.',
   'https://www.publix.com/savings/coupons/coupon-policy'),
  ('publix', 'regional_quirks', 'bogo_on_one',
   '{"states": ["FL","GA","SC","NC","AL","TN","VA"], "rule": "On BOGO items, buying one rings at 50% off in most regions (not all)."}',
   'Publix BOGO: buy 1 at 50% (regional).',
   'https://www.publix.com'),
  ('publix', 'ad_cycle', 'flip_day',
   '{"day_of_week": "Wednesday", "notes": "New ad Wed (most regions) or Thu (FL panhandle)."}',
   'Publix weekly ad flips Wednesday/Thursday.',
   'https://www.publix.com/savings/weekly-ad'),
  ('publix', 'rebate_compat', 'apps',
   '{"ibotta": true, "fetch": true, "checkout51": true}',
   'All three apps pay for Publix.',
   'https://www.publix.com'),

  -- =======================================================================
  -- SPROUTS
  -- =======================================================================
  ('sprouts', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": true, "notes": "Manufacturer coupons accepted; stack with Sprouts store coupons."}',
   'Sprouts accepts manufacturer + store coupons.',
   'https://www.sprouts.com'),
  ('sprouts', 'coupon_stacking', 'allows_manufacturer_plus_store',
   '{"allows": true, "notes": "Sprouts store coupon + manufacturer coupon stackable."}',
   'Sprouts allows mfr + store coupon stack.',
   'https://www.sprouts.com'),
  ('sprouts', 'rewards_program', 'sprouts_for_u',
   '{"name": "Sprouts For U (app)", "free": true, "notes": "Personalized offers + birthday perks."}',
   'Sprouts For U app has digital offers.',
   'https://www.sprouts.com/sprouts-for-u/'),
  ('sprouts', 'ad_cycle', 'flip_day',
   '{"day_of_week": "Wednesday", "notes": "Double Ad Wednesday — prior + new ad valid same day."}',
   'Sprouts Double Ad Wednesday.',
   'https://www.sprouts.com'),

  -- =======================================================================
  -- CVS  (ExtraBucks wizardry)
  -- =======================================================================
  ('cvs', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": true, "notes": "Manufacturer + CVS store coupons + CRT coupons + ExtraBucks all stackable."}',
   'CVS stacks manufacturer + store + CRT + ExtraBucks.',
   'https://www.cvs.com/content/coupon-policy'),
  ('cvs', 'coupon_stacking', 'allows_rebate_stack',
   '{"allows": true, "max_layers": 4, "layers": ["manufacturer", "cvs_store", "ExtraBucks", "rebate_app"]}',
   'CVS allows 4-layer stacks with rebate apps on top.',
   'https://www.cvs.com/content/coupon-policy'),
  ('cvs', 'rewards_program', 'extracare',
   '{"name": "ExtraCare", "free": true, "mechanics": "2% back + ExtraBucks on eligible items + personalized digital coupons."}',
   'CVS ExtraCare: 2% + ExtraBucks.',
   'https://www.cvs.com/extracare/home'),
  ('cvs', 'coupon_limits', 'like_coupon',
   '{"max_like_coupons_per_transaction": 4, "notes": "Up to 4 identical manufacturer coupons per transaction."}',
   'CVS like-coupon cap: 4 per transaction.',
   'https://www.cvs.com/content/coupon-policy'),

  -- =======================================================================
  -- WALGREENS
  -- =======================================================================
  ('walgreens', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": true, "notes": "Manufacturer + Walgreens store + paperless digital coupons stack."}',
   'Walgreens stacks manufacturer + store + digital.',
   'https://www.walgreens.com/topic/help/general/coupon_policy.jsp'),
  ('walgreens', 'rewards_program', 'mywalgreens',
   '{"name": "myWalgreens", "free": true, "mechanics": "1% Walgreens Cash store-wide; 5% on Walgreens brand."}',
   'myWalgreens: 1-5% Walgreens Cash.',
   'https://www.walgreens.com/topic/promotion/mywalgreens.jsp'),
  ('walgreens', 'coupon_stacking', 'allows_manufacturer_plus_store',
   '{"allows": true, "notes": "One manufacturer + one Walgreens store coupon + digital paperless per item."}',
   'Walgreens stacks manufacturer + store + digital.',
   'https://www.walgreens.com/topic/help/general/coupon_policy.jsp'),

  -- =======================================================================
  -- TRADER JOE'S
  -- =======================================================================
  ('trader_joes', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": false, "notes": "Trader Joe''s does not accept manufacturer or store coupons and does not run weekly sales."}',
   'Trader Joe''s accepts no coupons; no sales.',
   'https://www.traderjoes.com/home/faq'),
  ('trader_joes', 'rewards_program', 'has_program',
   '{"has_program": false, "notes": "No loyalty program. Stable everyday pricing is the value prop."}',
   'No loyalty; pricing is always-low.',
   'https://www.traderjoes.com'),
  ('trader_joes', 'returns', 'window',
   '{"days": null, "policy": "Full refund on any product (opened or not) with receipt; no fixed window."}',
   'TJ''s refunds any product, any time.',
   'https://www.traderjoes.com'),

  -- =======================================================================
  -- BRAVO SUPERMARKETS
  -- =======================================================================
  ('bravo', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": true, "notes": "Regional Caribbean/Latino grocer; accepts manufacturer coupons. Verify per franchise."}',
   'Bravo accepts manufacturer coupons (regional).',
   'https://www.shopbravo.com'),
  ('bravo', 'ad_cycle', 'flip_day',
   '{"day_of_week": "Friday", "notes": "Weekly circular typically flips Friday (verify per franchise)."}',
   'Bravo weekly ad flips Friday.',
   'https://www.shopbravo.com'),

  -- =======================================================================
  -- SAVE A LOT
  -- =======================================================================
  ('sav_a_lot', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": false, "notes": "Save A Lot historically does not accept manufacturer coupons (private-label model)."}',
   'Save A Lot accepts no manufacturer coupons.',
   'https://save-a-lot.com'),
  ('sav_a_lot', 'rewards_program', 'has_program',
   '{"has_program": false, "notes": "No loyalty program; deep-discount private-label model."}',
   'No loyalty; discount private-label model.',
   'https://save-a-lot.com'),

  -- =======================================================================
  -- KEY FOOD
  -- =======================================================================
  ('key_foods', 'coupon_acceptance', 'accepts_manufacturer_coupons',
   '{"accepts": true, "notes": "NYC/NJ cooperative grocer; most locations accept manufacturer coupons. Verify per store."}',
   'Key Food accepts manufacturer coupons.',
   'https://www.keyfood.com'),
  ('key_foods', 'rewards_program', 'key_rewards',
   '{"name": "Key Rewards (varies by co-op location)", "free": true}',
   'Key Rewards varies by location.',
   'https://www.keyfood.com'),
  ('key_foods', 'ad_cycle', 'flip_day',
   '{"day_of_week": "Friday", "notes": "Weekly circular flips Friday at most locations."}',
   'Key Food weekly ad flips Friday.',
   'https://www.keyfood.com')

  ) as t(s, pt, pk, vj, summary, origin)
  where exists (select 1 from public.stores where id = t.s)  -- only seed if store exists
)
insert into public.retailer_policies (
  store_id, policy_type, policy_key, value_json,
  summary, source_url, source_snippet, confidence,
  verified_by, last_verified_at
)
select
  store_id, policy_type, policy_key, value_json,
  summary, source_url, source_snippet, confidence,
  verified_by, last_verified_at
from baseline
on conflict (store_id, policy_type, policy_key) do nothing;

-- Small diagnostic note logged in the migration output.
do $$
declare
  seeded_count int;
begin
  select count(*)
    into seeded_count
    from public.retailer_policies
   where verified_by = 'baseline_seed';
  raise notice 'Baseline seed: % retailer_policies rows present (verified_by=baseline_seed).', seeded_count;
end $$;
