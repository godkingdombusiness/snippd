-- ============================================================
-- Snippd — Store Locations: National Expansion
-- Migration: 20260430_store_locations_national.sql
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING on upsert key)
--
-- Extends the store_locations table seeded in
-- 20260430_anticipatory_intelligence.sql (FL demo market).
--
-- Markets added here:
--   Tennessee (TN)  — Nashville, Memphis, Knoxville
--   Ohio (OH)       — Columbus, Cleveland, Cincinnati
--   Georgia (GA)    — Atlanta, Savannah
--   Texas (TX)      — Houston, Dallas, Austin
--   New York (NY)   — NYC, Buffalo
--   California (CA) — LA, San Francisco, San Diego
--   Illinois (IL)   — Chicago
--
-- To add a new market:
--   1. Add rows to the INSERT block below
--   2. Run this file in Dashboard SQL Editor
--   3. The GeofenceService auto-loads from store_locations — no code change needed
--
-- Coordinates are approximate store-level (not exact — geofence
-- radius_meters provides the buffer). Verify with Google Maps
-- before adding a real production store.
-- ============================================================

-- ── Tennessee ─────────────────────────────────────────────────
INSERT INTO public.store_locations
  (retailer_key, store_name, address, city, state, zip_code, latitude, longitude, radius_meters)
VALUES
  ('kroger',     'Kroger Nashville Green Hills',  '4012 Hillsboro Pike',      'Nashville',  'TN', '37215', 36.1006800, -86.8199300, 150),
  ('kroger',     'Kroger Memphis Germantown',     '7844 Germantown Pkwy',     'Memphis',    'TN', '38138', 35.1068200, -89.7920300, 150),
  ('publix',     'Publix Nashville Cool Springs', '1720 Galleria Blvd',       'Franklin',   'TN', '37067', 35.9296700, -86.8219400, 150),
  ('aldi',       'Aldi Nashville',                '3900 Hillsboro Pike',      'Nashville',  'TN', '37215', 36.1023100, -86.8144200, 120),
  ('walmart',    'Walmart Nashville Antioch',     '5824 Nolensville Pike',    'Nashville',  'TN', '37211', 36.0677700, -86.7206800, 200),
  ('target',     'Target Nashville Green Hills',  '3900 Hillsboro Pike',      'Nashville',  'TN', '37215', 36.1023100, -86.8144200, 200),
  ('whole_foods','Whole Foods Nashville',         '4601 Charlotte Ave',       'Nashville',  'TN', '37209', 36.1614400, -86.8358200, 150)
ON CONFLICT DO NOTHING;

-- ── Ohio ──────────────────────────────────────────────────────
INSERT INTO public.store_locations
  (retailer_key, store_name, address, city, state, zip_code, latitude, longitude, radius_meters)
VALUES
  ('kroger',     'Kroger Columbus Bethel',        '4230 W Broad St',          'Columbus',   'OH', '43228', 39.9595300, -83.0997400, 150),
  ('kroger',     'Kroger Cleveland Parma',        '6625 W 130th St',          'Parma',      'OH', '44130', 41.3765200, -81.7289700, 150),
  ('meijer',     'Meijer Columbus West',          '1463 Gemini Pl',           'Columbus',   'OH', '43240', 40.1162300, -82.9246700, 200),
  ('aldi',       'Aldi Columbus Westerville',     '831 Worthington Rd',       'Westerville','OH', '43082', 40.1037700, -82.9204500, 120),
  ('target',     'Target Columbus Easton',        '4030 Morse Rd',            'Columbus',   'OH', '43219', 40.0709800, -82.9127600, 200),
  ('whole_foods','Whole Foods Columbus',          '3670 W Dublin-Granville Rd','Columbus',  'OH', '43235', 40.1226400, -83.0494200, 150)
ON CONFLICT DO NOTHING;

-- ── Georgia ───────────────────────────────────────────────────
INSERT INTO public.store_locations
  (retailer_key, store_name, address, city, state, zip_code, latitude, longitude, radius_meters)
VALUES
  ('publix',     'Publix Atlanta Buckhead',       '3330 Piedmont Rd NE',      'Atlanta',    'GA', '30305', 33.8517300, -84.3643400, 150),
  ('publix',     'Publix Atlanta Midtown',        '650 Ponce De Leon Ave NE', 'Atlanta',    'GA', '30308', 33.7722800, -84.3627600, 150),
  ('kroger',     'Kroger Atlanta Sandy Springs',  '6300 Roswell Rd',          'Atlanta',    'GA', '30328', 33.9279600, -84.3775400, 150),
  ('whole_foods','Whole Foods Atlanta Buckhead',  '77 W Paces Ferry Rd NW',   'Atlanta',    'GA', '30305', 33.8510100, -84.3813500, 150),
  ('target',     'Target Atlanta Midtown',        '1275 Caroline St NE',      'Atlanta',    'GA', '30307', 33.7628900, -84.3484600, 200),
  ('costco',     'Costco Atlanta Brookhaven',     '4849 Peachtree Rd',        'Brookhaven', 'GA', '30341', 33.8817300, -84.3252300, 250)
ON CONFLICT DO NOTHING;

-- ── Texas ─────────────────────────────────────────────────────
INSERT INTO public.store_locations
  (retailer_key, store_name, address, city, state, zip_code, latitude, longitude, radius_meters)
VALUES
  ('heb',        'H-E-B Austin South Lamar',     '2400 S Congress Ave',      'Austin',     'TX', '78704', 30.2410100, -97.7499500, 150),
  ('heb',        'H-E-B Houston Montrose',       '3663 Washington Ave',      'Houston',    'TX', '77007', 29.7752800, -95.3991500, 150),
  ('heb',        'H-E-B San Antonio Stone Oak',  '18235 Stone Oak Pkwy',     'San Antonio','TX', '78258', 29.6326700, -98.4866700, 150),
  ('kroger',     'Kroger Dallas Mockingbird',    '5959 E Mockingbird Ln',    'Dallas',     'TX', '75206', 32.8375900, -96.7690100, 150),
  ('whole_foods','Whole Foods Austin Domain',    '11920 Domain Dr',          'Austin',     'TX', '78758', 30.4029500, -97.7257300, 150),
  ('costco',     'Costco Houston Katy',          '2900 S Mason Rd',          'Katy',       'TX', '77450', 29.7408800, -95.7651100, 250),
  ('target',     'Target Austin Lamar',          '5601 N Lamar Blvd',        'Austin',     'TX', '78751', 30.3218600, -97.7450000, 200),
  ('walmart',    'Walmart Dallas Garland',       '3020 W Walnut St',         'Garland',    'TX', '75042', 32.9266800, -96.6658900, 200)
ON CONFLICT DO NOTHING;

-- ── New York ──────────────────────────────────────────────────
INSERT INTO public.store_locations
  (retailer_key, store_name, address, city, state, zip_code, latitude, longitude, radius_meters)
VALUES
  ('whole_foods','Whole Foods NYC Columbus Circle', '10 Columbus Circle',     'New York',   'NY', '10019', 40.7684200, -73.9823300, 120),
  ('whole_foods','Whole Foods NYC Union Square',    '4 Union Sq S',           'New York',   'NY', '10003', 40.7352600, -73.9908100, 120),
  ('trader_joes','Trader Joes NYC West Village',   '675 6th Ave',             'New York',   'NY', '10010', 40.7430900, -73.9946500, 100),
  ('target',     'Target NYC East Harlem',          '517 E 117th St',         'New York',   'NY', '10035', 40.7954700, -73.9359500, 150),
  ('costco',     'Costco Queens LIC',               '32-50 Vernon Blvd',      'Long Island City','NY','11106',40.7515700,-73.9415200, 200),
  ('wegmans',    'Wegmans NYC Brooklyn',            '212 3rd St',             'Brooklyn',   'NY', '11215', 40.6759200, -73.9981800, 150)
ON CONFLICT DO NOTHING;

-- ── California ────────────────────────────────────────────────
INSERT INTO public.store_locations
  (retailer_key, store_name, address, city, state, zip_code, latitude, longitude, radius_meters)
VALUES
  ('whole_foods','Whole Foods LA Silver Lake',    '2520 Glendale Blvd',       'Los Angeles','CA', '90039', 34.1043200, -118.2617900, 150),
  ('trader_joes','Trader Joes SF Mission',        '3950 24th St',             'San Francisco','CA','94114',37.7523400,-122.4263900, 100),
  ('ralphs',     'Ralphs LA West Hollywood',     '8916 Santa Monica Blvd',   'West Hollywood','CA','90069',34.0909400,-118.3792100, 150),
  ('vons',       'Vons San Diego Mission Valley','1270 Frazee Rd',            'San Diego',  'CA', '92108', 32.7661200, -117.1637900, 150),
  ('costco',     'Costco SF SoMa',               '450 10th St',              'San Francisco','CA','94103',37.7723400,-122.4118700, 250),
  ('target',     'Target LA Hollywood',          '5520 W Sunset Blvd',       'Hollywood',  'CA', '90028', 34.0966500, -118.3274500, 200),
  ('aldi',       'Aldi Sacramento',              '6100 Florin Rd',           'Sacramento', 'CA', '95823', 38.4756500, -121.4356700, 120)
ON CONFLICT DO NOTHING;

-- ── Illinois ──────────────────────────────────────────────────
INSERT INTO public.store_locations
  (retailer_key, store_name, address, city, state, zip_code, latitude, longitude, radius_meters)
VALUES
  ('whole_foods','Whole Foods Chicago Lincoln Park','1550 N Kingsbury St',    'Chicago',    'IL', '60642', 41.9109800, -87.6484800, 150),
  ('jewel_osco', 'Jewel-Osco Chicago Streeterville','302 E Ontario St',      'Chicago',    'IL', '60611', 41.8934100, -87.6213900, 150),
  ('mariano',    'Mariano's Chicago Lincoln Square','4710 N Clark St',        'Chicago',    'IL', '60640', 41.9671600, -87.6565600, 150),
  ('costco',     'Costco Chicago Clybourn',      '2746 N Clybourn Ave',      'Chicago',    'IL', '60614', 41.9337900, -87.6568400, 250),
  ('target',     'Target Chicago River North',    '1 S State St',             'Chicago',    'IL', '60603', 41.8827700, -87.6282800, 150),
  ('aldi',       'Aldi Chicago Logan Square',    '2632 N Elston Ave',        'Chicago',    'IL', '60647', 41.9311500, -87.6834000, 120)
ON CONFLICT DO NOTHING;

-- ── Verification ──────────────────────────────────────────────
-- After running, check coverage:
--
-- SELECT state, COUNT(*) AS store_count,
--        array_agg(DISTINCT retailer_key ORDER BY retailer_key) AS retailers
-- FROM   public.store_locations
-- WHERE  is_active = true
-- GROUP  BY state
-- ORDER  BY state;
--
-- Expected: FL(10), TN(7), OH(6), GA(6), TX(8), NY(6), CA(7), IL(6) = 56 stores

SELECT
  'store_locations_national OK — ' ||
  COUNT(*)::text || ' total active stores across ' ||
  COUNT(DISTINCT state)::text || ' states' AS status
FROM public.store_locations
WHERE is_active = true;
