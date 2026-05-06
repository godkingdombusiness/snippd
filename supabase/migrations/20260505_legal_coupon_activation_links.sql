-- Legal coupon activation links for stack items.
-- Snippd can build the stack, while official retailer links remain the source
-- of truth for clipping/activation unless exact coupon evidence is supplied.

alter table public.app_home_feed
  add column if not exists legal_coupon_activation_mode text default 'official_link_only',
  add column if not exists official_coupon_url text;

alter table public.stack_candidates
  add column if not exists legal_coupon_activation_mode text default 'official_link_only',
  add column if not exists official_coupon_url text;

update public.app_home_feed
set
  legal_coupon_activation_mode = 'official_link_only',
  official_coupon_url = case
    when regexp_replace(lower(coalesce(retailer, '')), '[^a-z0-9]+', '_', 'g') in ('dollar_general', 'dollar_general_')
      then 'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0'
    when regexp_replace(lower(coalesce(retailer, '')), '[^a-z0-9]+', '_', 'g') in ('publix', 'publix_')
      then 'https://www.publix.com/savings/digital-coupons'
    else official_coupon_url
  end,
  breakdown_list = coalesce((
    select jsonb_agg(
      case
        when jsonb_typeof(item) = 'object' then
          item ||
          jsonb_build_object(
            'official_coupon_url',
            case
              when regexp_replace(lower(coalesce(app_home_feed.retailer, '')), '[^a-z0-9]+', '_', 'g') in ('dollar_general', 'dollar_general_')
                then 'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0'
              when regexp_replace(lower(coalesce(app_home_feed.retailer, '')), '[^a-z0-9]+', '_', 'g') in ('publix', 'publix_')
                then 'https://www.publix.com/savings/digital-coupons'
              else null
            end,
            'retailer_coupon_hub_url',
            case
              when regexp_replace(lower(coalesce(app_home_feed.retailer, '')), '[^a-z0-9]+', '_', 'g') in ('dollar_general', 'dollar_general_')
                then 'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0'
              when regexp_replace(lower(coalesce(app_home_feed.retailer, '')), '[^a-z0-9]+', '_', 'g') in ('publix', 'publix_')
                then 'https://www.publix.com/savings/digital-coupons'
              else null
            end,
            'coupon_link_status', 'official_hub',
            'coupon_status', 'needs_user_verification'
          )
        else item
      end
    )
    from jsonb_array_elements(coalesce(app_home_feed.breakdown_list, '[]'::jsonb)) as item
  ), breakdown_list)
where regexp_replace(lower(coalesce(retailer, '')), '[^a-z0-9]+', '_', 'g') in ('dollar_general', 'dollar_general_', 'publix', 'publix_');

comment on column public.app_home_feed.legal_coupon_activation_mode is
  'official_link_only means Snippd builds the stack but users clip/activate coupons on the official retailer site/app unless exact evidence exists.';
