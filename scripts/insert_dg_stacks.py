"""
Insert 3 Dollar General stacks into app_home_feed.
Run: python scripts/insert_dg_stacks.py
"""
import json
import urllib.request
import urllib.error

SUPABASE_URL = "https://gsnbpfpekqqjlmkgvwvb.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbmJwZnBla3Fxamxta2d2d3ZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjkwNzUzOCwiZXhwIjoyMDgyNDgzNTM4fQ.1bzKLip3paBcWhkisbJBSBR2lpEiDL-9D_6SXKM5NuM"

HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}

WEEK_START = "2026-04-28"
REGION     = "US-Southeast"

STACKS = [
    # ── 1. Household Essentials ──────────────────────────────────────────────
    {
        "title":                     "Dollar General Household Essentials Stack",
        "retailer":                  "Dollar General",
        "meal_type":                 "household",
        "card_type":                 "meal_stack",
        "pay_price":                 11.74,
        "save_price":                7.26,
        "final_out_of_pocket_cents": 1174,
        "subtotal_cents":            1900,
        "total_discounts_cents":     726,
        "savings_percent":           38,
        "item_count":                4,
        "stack_type":                "SALE_PLUS_DIGITAL_COUPON",
        "confidence":                "HIGH",
        "best_shop_window":          "Valid thru May 8",
        "status":                    "active",
        "verification_status":       "verified_live",
        "week_start":                WEEK_START,
        "region":                    REGION,
        "dietary_tags":              ["STOCK_UP", "BULK", "HOUSEHOLD"],
        "breakdown_list": [
            {"item": "Brawny Paper Towels 6-pk",    "type": "product",        "price": 550},
            {"item": "Dawn Dish Soap 19oz",          "type": "product",        "price": 225},
            {"item": "Fabuloso Multi-Purpose 33oz",  "type": "product",        "price": 250},
            {"item": "DG Digital Coupon -$1.50",     "type": "digital_coupon", "price": -150},
        ],
        "instructions": [
            {"step": 1, "action": "Load DG app digital coupon: $1.50 off household purchase"},
            {"step": 2, "action": "Buy Brawny 6-pk at sale price $5.50"},
            {"step": 3, "action": "Add Dawn Dish Soap 19oz — sale $2.25"},
            {"step": 4, "action": "Add Fabuloso 33oz — sale $2.50"},
            {"step": 5, "action": "Digital coupon deducts $1.50 at checkout"},
        ],
        "preference_profile": {"region": REGION, "source": "snippd-curated"},
        "source_summary":     {"description": "DG weekly ad + digital coupon stack. 4 household items under $12."},
    },
    # ── 2. Pantry Stock-Up ───────────────────────────────────────────────────
    {
        "title":                     "DG Pantry Stock-Up: Pasta, Sauce & Soup",
        "retailer":                  "Dollar General",
        "meal_type":                 "pantry",
        "card_type":                 "meal_stack",
        "pay_price":                 9.24,
        "save_price":                6.01,
        "final_out_of_pocket_cents": 924,
        "subtotal_cents":            1525,
        "total_discounts_cents":     601,
        "savings_percent":           39,
        "item_count":                4,
        "stack_type":                "SALE_PLUS_DIGITAL_COUPON",
        "confidence":                "HIGH",
        "best_shop_window":          "Valid thru May 8",
        "status":                    "active",
        "verification_status":       "verified_live",
        "week_start":                WEEK_START,
        "region":                    REGION,
        "dietary_tags":              ["PANTRY", "STOCK_UP", "BULK"],
        "breakdown_list": [
            {"item": "Barilla Spaghetti 3-pk (1lb each)", "type": "product",        "price": 375},
            {"item": "Hunt's Tomato Sauce 4-pk (15oz)",   "type": "product",        "price": 250},
            {"item": "Progresso Classic Soup 2-pk",       "type": "product",        "price": 399},
            {"item": "DG Smart Coupon -$1.00 pantry",     "type": "digital_coupon", "price": -100},
        ],
        "instructions": [
            {"step": 1, "action": "Load DG Smart Coupon: $1.00 off any 3+ pantry items"},
            {"step": 2, "action": "Buy Barilla Spaghetti 3-pk — sale $3.75"},
            {"step": 3, "action": "Add Hunt's Tomato Sauce 4-pk — sale $2.50"},
            {"step": 4, "action": "Add Progresso Soup 2-pk — sale $3.99"},
            {"step": 5, "action": "Coupon auto-applies at checkout — total $9.24"},
        ],
        "preference_profile": {"region": REGION, "source": "snippd-curated"},
        "source_summary":     {"description": "DG pantry essential stack. Pasta, sauce, and soup under $10."},
    },
    # ── 3. Snacks + Drinks Weekend Stack ────────────────────────────────────
    {
        "title":                     "DG Snacks & Drinks Weekend Stack",
        "retailer":                  "Dollar General",
        "meal_type":                 "snacks",
        "card_type":                 "meal_stack",
        "pay_price":                 12.73,
        "save_price":                5.27,
        "final_out_of_pocket_cents": 1273,
        "subtotal_cents":            1800,
        "total_discounts_cents":     527,
        "savings_percent":           29,
        "item_count":                3,
        "stack_type":                "BOGO_PLUS_SALE",
        "confidence":                "VERIFIED",
        "best_shop_window":          "Valid thru May 8",
        "status":                    "active",
        "verification_status":       "verified_live",
        "week_start":                WEEK_START,
        "region":                    REGION,
        "dietary_tags":              ["BOGO", "SNACKS", "WEEKEND"],
        "breakdown_list": [
            {"item": "Lay's Variety Pack 18-count", "type": "product", "price": 399},
            {"item": "Coca-Cola 12-pk Cans",         "type": "product", "price": 500},
            {"item": "Oreo Family Size",             "type": "product", "price": 374},
        ],
        "instructions": [
            {"step": 1, "action": "Lay's Variety 18-ct on DG sale — $3.99"},
            {"step": 2, "action": "Coca-Cola 12-pk — weekly special $5.00"},
            {"step": 3, "action": "Oreo Family Size BOGO 50% off — $3.74"},
            {"step": 4, "action": "No coupon needed — sale prices auto-applied at register"},
        ],
        "preference_profile": {"region": REGION, "source": "snippd-curated"},
        "source_summary":     {"description": "DG snacks and drinks deal. Weekend essentials under $13."},
    },
]


def post(data: list) -> dict:
    body = json.dumps(data).encode()
    req  = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/app_home_feed",
        data=body,
        headers=HEADERS,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return {"status": resp.status, "rows": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "error": e.read().decode()}


if __name__ == "__main__":
    print("Inserting 3 Dollar General stacks...")
    result = post(STACKS)
    if result.get("error"):
        print(f"ERROR {result['status']}: {result['error']}")
    else:
        rows = result.get("rows", [])
        print(f"OK — inserted {len(rows)} rows")
        for r in rows:
            pct = r.get("savings_percent", 0)
            oop = r.get("final_out_of_pocket_cents", 0)
            print(f"  id={r.get('id')}  {r.get('title', '')[:50]}  {pct}% off  ${oop/100:.2f}")
