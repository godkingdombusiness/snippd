import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CSV_PATH = process.env.COUPONS_CSV_PATH || "./coupons.csv";
const DEFAULT_CATEGORY = process.env.DEFAULT_CATEGORY || "groceries";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("? Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (SUPABASE_URL.includes("YOURPROJECT") || SERVICE_ROLE_KEY.includes("YOUR_SERVICE_ROLE_KEY")) {
  console.error("? Update .env first: replace YOURPROJECT + YOUR_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function must(val, name) {
  const s = (val ?? "").toString().trim();
  if (!s) throw new Error(`Missing required field: ${name}`);
  return s;
}
function toBool(v) {
  return String(v).trim().toLowerCase() === "true";
}
function toNumber(v, name) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${name}: ${v}`);
  return n;
}
function toISO(v, name) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for ${name}: ${v}`);
  return d.toISOString();
}

async function upsertItemByName(itemName) {
  // Try insert (case-insensitive unique index should exist)
  await supabase.from("stashd_items").insert({ name: itemName, category: DEFAULT_CATEGORY });

  // Fetch item id (case-insensitive)
  const { data, error } = await supabase
    .from("stashd_items")
    .select("id,name")
    .ilike("name", itemName)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error(`Could not find item after insert: ${itemName}`);
  return data.id;
}

async function insertCoupon(row) {
  const store_code = must(row.store_code, "store_code");
  const item_name = must(row.item_name, "item_name");
  const title = must(row.title, "title");
  const description = (row.description || "").trim() || null;
  const discount_amount = toNumber(must(row.discount_amount, "discount_amount"), "discount_amount");
  const source_url = must(row.source_url, "source_url");
  const expires_at = toISO(must(row.expires_at, "expires_at"), "expires_at");
  const verified = toBool(row.verified);

  const item_id = await upsertItemByName(item_name);

  const payload = {
    store_code,
    item_id,
    title,
    description,
    discount_amount,
    source_url,
    expires_at,
    verified,
    verified_at: verified ? new Date().toISOString() : null
  };

  const { error } = await supabase.from("stashd_coupons").insert(payload);
  if (error) throw error;
}

async function main() {
  const csv = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });

  console.log(`?? Found ${rows.length} coupon rows in ${CSV_PATH}`);
  let ok = 0;

  for (const row of rows) {
    try {
      await insertCoupon(row);
      ok++;
      console.log(`? Inserted: ${row.store_code} | ${row.item_name} | ${row.title}`);
    } catch (e) {
      console.error("? Failed row:", row);
      console.error(e?.message || e);
    }
  }

  console.log(`?? Done. Inserted ${ok}/${rows.length} coupons.`);
  console.log(`Next: verify in Supabase table public.stashd_coupons (and view stashd_valid_coupons).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
