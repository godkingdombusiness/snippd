-- Seed retailer coupon policy defaults for the Wealth Engine

INSERT INTO public.retailer_coupon_parameters (retailer_key, policy_key, policy_value)
VALUES
  ('target', 'max_stack_items', '{"value": 8}'),
  ('target', 'allowed_coupon_types', '{"value": ["manufacturer", "store", "digital"]}'),
  ('target', 'max_total_coupon_value', '{"value": 15000}'),
  ('walmart', 'max_stack_items', '{"value": 10}'),
  ('walmart', 'allowed_coupon_types', '{"value": ["manufacturer", "store"]}'),
  ('walmart', 'max_total_coupon_value', '{"value": 12000}'),
  ('cvs', 'max_stack_items', '{"value": 6}'),
  ('cvs', 'allowed_coupon_types', '{"value": ["manufacturer", "digital"]}'),
  ('cvs', 'max_total_coupon_value', '{"value": 9000}'),
  ('publix', 'max_stack_items', '{"value": 7}'),
  ('publix', 'allowed_coupon_types', '{"value": ["manufacturer", "digital", "store"]}'),
  ('publix', 'max_total_coupon_value', '{"value": 10000}')
ON CONFLICT DO NOTHING;
