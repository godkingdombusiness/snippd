# Snippd — Coupon Stacking Engine

> The stacking engine computes the optimal combination of offers for a basket,
> applying them in a defined canonical order and enforcing per-retailer policy rules.

---

## Files

| File | Role |
|---|---|
| `src/types/stacking.ts` | All TypeScript types (camelCase, computation-facing) |
| `src/services/stacking/policyLoader.ts` | Loads + caches `RetailerPolicy` from DB |
| `src/services/stacking/stackValidator.ts` | Pure offer validation (no I/O) |
| `src/services/stacking/stackCalculator.ts` | Pure price calculation (no I/O) |
| `src/services/stacking/stackingEngine.ts` | Orchestrator class |
| `supabase/functions/stack-compute/index.ts` | Edge Function entry point (Deno) |
| `src/services/stacking/__tests__/stackingEngine.test.ts` | 16 tests |

---

## Offer Application Order (Canonical)

Offers are always applied in this order, regardless of input order:

```
1. SALE              — Sale price (% off regular or fixed cents)
2. BOGO              — Buy-one-get-one (second_free / cheapest_free / half_off_both)
3. MULTI             — Multi-unit deal (3 for $10 style)
4. BUY_X_GET_Y       — Buy X get Y free
5. LOYALTY_PRICE     — Store loyalty card price
6. STORE_COUPON      — Retailer-issued coupon
7. MANUFACTURER_COUPON — Brand-issued coupon
8. DIGITAL_COUPON    — App/clip-to-card digital coupon
9. REBATE            — Mail-in or app rebate (tracked separately, does NOT reduce line total)
```

Each step uses the **running per-unit price** as its basis. Price floors at **$0** — offers cannot create a negative price.

---

## BOGO Models

| Model | Behavior |
|---|---|
| `second_free` (default) | For every 2 units, 1 is free. Effective per-unit = `(qty - floor(qty/2)) × price / qty` |
| `cheapest_free` | Same math as `second_free` |
| `half_off_both` | Every unit is 50% off: `new_price = round(price × 0.50)` |

BOGO requires at least 2 units to apply.

---

## Rounding Modes

| Mode | Behavior |
|---|---|
| `floor` (default) | `Math.floor()` — always rounds down |
| `round` | `Math.round()` — rounds to nearest cent |
| `ceil` | `Math.ceil()` — always rounds up |

Rounding mode is configured per retailer in `retailer_coupon_parameters`.

| Retailer | Rounding mode |
|---|---|
| publix | `round` |
| target, walmart, cvs, kroger | `floor` |

---

## Rebate Handling

Rebates are tracked **separately** from the line total:
- `lineRebateCents` accumulates rebate × qty
- The running price is NOT modified
- `totalSavingsCents = inStackSavingsCents + rebateCents`
- Rebates appear in `explanation.lineBreakdown[n].rebate` if non-zero

---

## Policy Loading (policyLoader.ts)

Policy is loaded from two tables in parallel:

```
retailer_coupon_parameters  →  max_stack_items, allowed_coupon_types,
                                max_total_coupon_value, max_manufacturer_coupons,
                                max_store_coupons, rounding_mode

retailer_rules              →  block_sale_and_digital, block_sale_and_loyalty,
                                block_bogo_and_coupon, block_coupon_and_loyalty
```

**Cache:** 15-minute in-process TTL per `retailer_key`. Shared across requests in the same process.

**Invalidation:**
```typescript
import { invalidatePolicy, clearPolicyCache } from './policyLoader';
invalidatePolicy('publix');   // single retailer
clearPolicyCache();           // all retailers
```

**Fallback:** If no rows found for a retailer, `DEFAULT_POLICY` is used:
```typescript
export const DEFAULT_POLICY: RetailerPolicy = {
  retailerKey: 'default',
  maxStackItems: 5,
  allowedCouponTypes: [],        // all types allowed
  maxTotalCouponValueCents: 10000,
  maxManufacturerCoupons: 1,
  maxStoreCoupons: 1,
  roundingMode: 'floor',
  blockSaleAndDigital: false,
  blockSaleAndLoyalty: false,
  blockBogoAndCoupon: false,
  blockCouponAndLoyalty: false,
};
```

---

## 11 Validation Rules (stackValidator.ts)

`validateOfferSet(items, policy)` runs these checks **in order** on each item:

| # | Check | Warning code | Action |
|---|---|---|---|
| 1 | Offer past `expires_at` | `OFFER_EXPIRED` | Reject offer |
| 2 | Item qty < `required_qty` | `QUANTITY_REQUIRED` | Reject offer |
| 3 | Item qty > `max_redemptions` | `MAX_REDEMPTIONS_REACHED` | Warn, keep offer (capped in calculator) |
| 4 | Multiple non-stackable offers | `NON_STACKABLE` | Keep first, reject rest |
| 5 | Offers in same `exclusion_group` | `MUTUAL_EXCLUSION` | Keep highest `priority`, reject rest |
| 6 | Coupon type not in `allowedCouponTypes` | `COUPON_TYPE_NOT_ALLOWED` | Reject offer |
| 7 | SALE + DIGITAL when `blockSaleAndDigital` | `SALE_DIGITAL_BLOCKED` | Reject DIGITAL offer |
| 8 | SALE + LOYALTY when `blockSaleAndLoyalty` | `SALE_LOYALTY_BLOCKED` | Reject LOYALTY offer |
| 9 | BOGO + any coupon when `blockBogoAndCoupon` | `BOGO_COUPON_BLOCKED` | Reject all coupons |
| 10 | Manufacturer coupons > `maxManufacturerCoupons` | `MANUFACTURER_LIMIT` | Keep highest value, reject rest |
| 11 | Store coupons > `maxStoreCoupons` | `STORE_LIMIT` | Keep highest value, reject rest |

Returns: `{ validItems, rejectedOfferIds, warnings }`

---

## Retailer Policy Table (Seeded)

| Retailer | Max items | Allowed types | Max MFR | Max Store | Rounding | block_bogo+coupon | block_sale+digital |
|---|---|---|---|---|---|---|---|
| publix | 7 | mfr, digital, store | 1 | 1 | round | **true** | false |
| target | 8 | mfr, store, digital | 1 | 1 | floor | false | false |
| walmart | 10 | mfr, store | 1 | 1 | floor | false | **true** |
| cvs | 6 | mfr, digital | 1 | 0 | floor | false | false |
| kroger | 8 | mfr, store, digital | 1 | 1 | floor | false | false |

---

## How to Add a New Retailer

1. **Insert coupon parameters** into `retailer_coupon_parameters`:
   ```sql
   INSERT INTO retailer_coupon_parameters (retailer_key, policy_key, policy_value)
   VALUES
     ('newstore', 'max_stack_items',          '{"value": 6}'),
     ('newstore', 'allowed_coupon_types',     '{"value": ["manufacturer", "digital"]}'),
     ('newstore', 'max_total_coupon_value',   '{"value": 8000}'),
     ('newstore', 'max_manufacturer_coupons', '{"value": 1}'),
     ('newstore', 'max_store_coupons',        '{"value": 0}'),
     ('newstore', 'rounding_mode',            '{"value": "floor"}')
   ON CONFLICT DO NOTHING;
   ```

2. **Insert stacking rules** into `retailer_rules`:
   ```sql
   INSERT INTO retailer_rules (retailer_key, rule_key, rule_value, priority)
   VALUES
     ('newstore', 'block_bogo_and_coupon',  '{"value": false}', 10),
     ('newstore', 'block_sale_and_digital', '{"value": true}',  10),
     ('newstore', 'block_sale_and_loyalty', '{"value": false}', 10)
   ON CONFLICT (retailer_key, rule_key) DO NOTHING;
   ```

3. **Invalidate cache** if services are running:
   ```typescript
   import { invalidatePolicy } from './src/services/stacking/policyLoader';
   invalidatePolicy('newstore');
   ```

4. **Update docs/DATABASE.md** — add the retailer to the seeded values table.
5. **Update docs/STACKING_ENGINE.md** — add the retailer to the policy table above.

---

## Example: Stack Input and Output

**Input**
```json
{
  "retailer_key": "publix",
  "basket_id": "basket-001",
  "items": [
    {
      "id": "item-1",
      "name": "Orange Juice",
      "regular_price_cents": 599,
      "quantity": 2,
      "offers": [
        { "id": "o1", "offer_type": "BOGO", "bogo_model": "second_free", "stackable": true },
        { "id": "o2", "offer_type": "MANUFACTURER_COUPON", "discount_cents": 75,
          "coupon_type": "manufacturer", "stackable": true }
      ]
    }
  ]
}
```

**Publix policy:** `block_bogo_and_coupon = true`

**Validation:** BOGO present + coupon present → `BOGO_COUPON_BLOCKED` warning, coupon o2 rejected.

**Calculation (BOGO only, qty=2):**
- Regular: $5.99/unit
- BOGO second_free: `(2-1) × 5.99 / 2 = $2.995` → rounded (publix rounds) = $3.00/unit
- Line total: $3.00 × 2 = $6.00
- Savings: $11.98 - $6.00 = $5.98

**Output excerpt**
```json
{
  "basketRegularCents": 1198,
  "basketFinalCents": 600,
  "inStackSavingsCents": 598,
  "warnings": [
    {
      "code": "BOGO_COUPON_BLOCKED",
      "offerId": "o2",
      "message": "publix policy blocks coupons when a BOGO is present"
    }
  ],
  "rejectedOfferIds": ["o2"],
  "explanation": {
    "summary": "Stack saves $5.98 (49.9%) on 1 item(s) at publix."
  }
}
```

---

## Testing

```bash
# Run all 16 tests
npx ts-node --project tsconfig.test.json \
  src/services/stacking/__tests__/stackingEngine.test.ts

# Type check
npx tsc --noEmit --project tsconfig.test.json
```

Tests use `computeWithPolicy()` (no Supabase required) and `DEFAULT_POLICY` or custom policies.
