-- =============================================================================
-- HOTEL IT INVENTORY MANAGEMENT
-- SUPABASE REALTIME ACTIVATION (SAFE / IDEMPOTENT)
--
-- Run the ENTIRE script in Supabase SQL Editor.
-- This keeps the existing supabase_realtime publication and only adds
-- application tables that are not already included.
-- It does not drop/recreate the publication or change RLS policies.
-- =============================================================================

DO $realtime$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'master_items',
    'stock_transactions',
    'department_movements',
    'purchase_orders',
    'preloved',
    'activities',
    'pcs',
    'pc_movements',
    'pc_component_movements',
    'shared_notes',
    'private_notes'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Publication supabase_realtime was not found.';
  END IF;

  -- Validate that all expected tables exist before modifying the publication.
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Required table public.% is missing. Check the app schema/migrations.', v_table;
    END IF;
  END LOOP;

  -- Add only tables that are not already in supabase_realtime.
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        v_table
      );
    END IF;
  END LOOP;
END;
$realtime$;

-- Verification: each of the 11 rows should show PUBLISHED.
SELECT
  expected.table_name,
  CASE
    WHEN relation.oid IS NULL THEN 'TABLE MISSING'
    WHEN published.tablename IS NULL THEN 'NOT PUBLISHED'
    ELSE 'PUBLISHED'
  END AS publication_status,
  CASE relation.relreplident
    WHEN 'd' THEN 'DEFAULT'
    WHEN 'f' THEN 'FULL'
    WHEN 'i' THEN 'INDEX'
    WHEN 'n' THEN 'NOTHING'
    ELSE 'UNKNOWN'
  END AS replica_identity
FROM (
  VALUES
    ('master_items'),
    ('stock_transactions'),
    ('department_movements'),
    ('purchase_orders'),
    ('preloved'),
    ('activities'),
    ('pcs'),
    ('pc_movements'),
    ('pc_component_movements'),
    ('shared_notes'),
    ('private_notes')
) AS expected(table_name)
LEFT JOIN pg_class AS relation
  ON relation.oid = to_regclass(format('public.%I', expected.table_name))
LEFT JOIN (
  SELECT schemaname, tablename
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
) AS published
  ON published.schemaname = 'public'
 AND published.tablename = expected.table_name
ORDER BY expected.table_name;
