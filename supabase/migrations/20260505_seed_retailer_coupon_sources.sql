-- Seed trusted retailer coupon source pages.
-- These rows do not create user-facing coupons by themselves. They tell the
-- refresh runner which official retailer pages need retailer-specific adapters
-- or exact evidence payloads before coupons can appear in the app.

insert into public.retailer_coupon_sources
  (retailer_key, store_region, source_url, source_type, is_active, last_checked_at)
values
  ('publix', null, 'https://www.publix.com/savings/digital-coupons', 'retailer_digital_coupon_page', true, null),
  ('kroger', null, 'https://www.kroger.com/savings/cl/coupons', 'retailer_digital_coupon_page', true, null),
  ('dollar_general', null, 'https://www.dollargeneral.com/deals/coupons', 'dollar_general_public_api', true, null),
  ('target', null, 'https://www.target.com/circle', 'retailer_digital_coupon_page', true, null),
  ('cvs', null, 'https://www.cvs.com/extracare/home', 'retailer_digital_coupon_page', true, null),
  ('walgreens', null, 'https://www.walgreens.com/offers/offers.jsp', 'retailer_digital_coupon_page', true, null)
on conflict do nothing;

update public.retailer_coupon_sources
set
  source_url = 'https://www.dollargeneral.com/deals/coupons',
  source_type = 'dollar_general_public_api',
  is_active = true
where retailer_key = 'dollar_general';

with ranked_sources as (
  select
    id,
    row_number() over (
      partition by retailer_key, source_url
      order by created_at asc, id asc
    ) as rn
  from public.retailer_coupon_sources
)
delete from public.retailer_coupon_sources s
using ranked_sources r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists retailer_coupon_sources_retailer_url_uidx
  on public.retailer_coupon_sources (retailer_key, source_url);
