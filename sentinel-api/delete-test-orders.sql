-- Delete test order items first (foreign key order)
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders
  WHERE store_id = 'martaline'
  AND order_number IN ('3957','3958','3959','3960','3961','3962')
);

-- Delete the test orders themselves
DELETE FROM orders
WHERE store_id = 'martaline'
AND order_number IN ('3957','3958','3959','3960','3961','3962');
