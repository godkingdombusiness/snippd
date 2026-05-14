/**
 * weeklyDealsService.js — mock weekly deals + personalized deal selector.
 * Replace mockWeeklyDeals with a live Supabase or edge-function call when ready.
 */

var mockWeeklyDeals = [
  {
    id: 'd001',
    store_key: 'publix',
    store_name: 'Publix',
    title: 'Chicken Breast Family Pack',
    description: 'Fresh boneless, skinless chicken breast — BOGO free this week',
    deal_type: 'bogos',
    original_price_cents: 1599,
    sale_price_cents: 799,
    coupon_value_cents: 0,
    final_price_cents: 799,
    savings_percent: 50,
    expires_at: '2026-05-18',
    image_url: null,
    requires_loyalty: false,
  },
  {
    id: 'd002',
    store_key: 'aldi',
    store_name: 'Aldi',
    title: 'Whole Milk Gallon',
    description: 'ALDI-exclusive dairy at the lowest price this week',
    deal_type: 'weekly_ads',
    original_price_cents: 399,
    sale_price_cents: 259,
    coupon_value_cents: 0,
    final_price_cents: 259,
    savings_percent: 35,
    expires_at: '2026-05-18',
    image_url: null,
    requires_loyalty: false,
  },
  {
    id: 'd003',
    store_key: 'publix',
    store_name: 'Publix',
    title: 'Organic Baby Spinach 5oz',
    description: 'Organic spinach, health savings — no loyalty card required',
    deal_type: 'health_savings',
    original_price_cents: 499,
    sale_price_cents: 299,
    coupon_value_cents: 0,
    final_price_cents: 299,
    savings_percent: 40,
    expires_at: '2026-05-18',
    image_url: null,
    requires_loyalty: false,
  },
  {
    id: 'd004',
    store_key: 'walmart',
    store_name: 'Walmart',
    title: 'Great Value Eggs 18-ct',
    description: 'Rollback price on large eggs — no coupon needed',
    deal_type: 'lowest_total',
    original_price_cents: 449,
    sale_price_cents: 319,
    coupon_value_cents: 0,
    final_price_cents: 319,
    savings_percent: 29,
    expires_at: '2026-05-21',
    image_url: null,
    requires_loyalty: false,
  },
  {
    id: 'd005',
    store_key: 'kroger',
    store_name: 'Kroger',
    title: 'Kroger Cheddar Cheese 16oz',
    description: 'Digital coupon: $1 off when you load to your Kroger card',
    deal_type: 'digital_coupons',
    original_price_cents: 599,
    sale_price_cents: 499,
    coupon_value_cents: 100,
    final_price_cents: 399,
    savings_percent: 33,
    expires_at: '2026-05-17',
    image_url: null,
    requires_loyalty: true,
  },
  {
    id: 'd006',
    store_key: 'target',
    store_name: 'Target',
    title: 'Nature Made Fish Oil 150ct',
    description: 'Circle offer: 20% off all supplements this week',
    deal_type: 'loyalty_offers',
    original_price_cents: 2499,
    sale_price_cents: 1999,
    coupon_value_cents: 0,
    final_price_cents: 1999,
    savings_percent: 20,
    expires_at: '2026-05-18',
    image_url: null,
    requires_loyalty: true,
  },
  {
    id: 'd007',
    store_key: 'aldi',
    store_name: 'Aldi',
    title: 'Salmon Fillets 1lb',
    description: 'Weekly Special — fresh Atlantic salmon at ALDI price',
    deal_type: 'weekly_ads',
    original_price_cents: 999,
    sale_price_cents: 649,
    coupon_value_cents: 0,
    final_price_cents: 649,
    savings_percent: 35,
    expires_at: '2026-05-18',
    image_url: null,
    requires_loyalty: false,
  },
  {
    id: 'd008',
    store_key: 'publix',
    store_name: 'Publix',
    title: 'Barilla Pasta 16oz (4-pack)',
    description: 'BOGO on Barilla — stock up on weeknight staples',
    deal_type: 'bogos',
    original_price_cents: 799,
    sale_price_cents: 399,
    coupon_value_cents: 0,
    final_price_cents: 399,
    savings_percent: 50,
    expires_at: '2026-05-18',
    image_url: null,
    requires_loyalty: false,
  },
  {
    id: 'd009',
    store_key: 'walmart',
    store_name: 'Walmart',
    title: 'Great Value Peanut Butter 40oz',
    description: 'Everyday low price — lowest total basket cost',
    deal_type: 'lowest_total',
    original_price_cents: 499,
    sale_price_cents: 349,
    coupon_value_cents: 0,
    final_price_cents: 349,
    savings_percent: 30,
    expires_at: '2026-05-25',
    image_url: null,
    requires_loyalty: false,
  },
  {
    id: 'd010',
    store_key: 'whole_foods',
    store_name: 'Whole Foods',
    title: '365 Almond Milk 64oz',
    description: 'Amazon Prime member deal — 25% off 365 brand',
    deal_type: 'loyalty_offers',
    original_price_cents: 499,
    sale_price_cents: 374,
    coupon_value_cents: 0,
    final_price_cents: 374,
    savings_percent: 25,
    expires_at: '2026-05-20',
    image_url: null,
    requires_loyalty: true,
  },
];

/**
 * getPersonalizedDeals — filters and sorts deals for a given user profile.
 * @param {object} profile  — onboardingProfile (preferred_stores, dealPreferences, weeklyBudget)
 * @param {Array}  allDeals — full deal list (defaults to mockWeeklyDeals)
 * @returns {Array} filtered + sorted deals, max 8
 */
function getPersonalizedDeals(profile, allDeals) {
  var deals = allDeals || mockWeeklyDeals;
  var stores   = (profile && profile.preferred_stores)  || [];
  var dealPrefs = (profile && profile.dealPreferences) || [];

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter by preferred stores (if user has selected any)
  var filtered = deals.filter(function (d) {
    var notExpired = !d.expires_at || new Date(d.expires_at) >= today;
    if (!notExpired) return false;
    if (stores.length > 0 && !stores.includes(d.store_key)) return false;
    return true;
  });

  // Boost score for deals matching user's deal preferences
  function dealScore(d) {
    var prefMatch = dealPrefs.length === 0 || dealPrefs.includes(d.deal_type) ? 1 : 0;
    var savingsPts = d.savings_percent || 0;
    var daysLeft = d.expires_at
      ? Math.max(0, Math.ceil((new Date(d.expires_at) - today) / 86400000))
      : 30;
    var urgencyPts = daysLeft <= 2 ? 20 : daysLeft <= 5 ? 10 : 0;
    return (prefMatch * 30) + savingsPts + urgencyPts;
  }

  filtered.sort(function (a, b) { return dealScore(b) - dealScore(a); });

  return filtered.slice(0, 8);
}

module.exports = { mockWeeklyDeals: mockWeeklyDeals, getPersonalizedDeals: getPersonalizedDeals };
