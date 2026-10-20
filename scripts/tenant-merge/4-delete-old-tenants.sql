-- Branch tenant merge, step 4: delete the three old tenants (jeusinema, jeubilgi, jeumagazine).
-- Run after 3-verify.sql shows a correct merge, and after a backup. One transaction.
-- Some foreign keys to app_tenants use ON DELETE CASCADE. So the script first makes sure that
-- no row of any table still points to these tenants. It stops and deletes nothing if one does.
BEGIN;

DO $delete$
DECLARE
  old_ids text[] := ARRAY['ca415d18-2211-4112-aa12-9b06da4fefd9',
                          '961af8d7-2f81-4e5a-a92e-356acfff6fc9',
                          '6ef1dc4b-5b58-4b23-8dc3-cfb8fa2b4e76'];
  col record;
  n bigint;
BEGIN
  -- Only tenants that the merge renamed
  SELECT count(*) INTO n FROM app_tenants WHERE id::text = ANY (old_ids) AND name LIKE '% (merged)';
  IF n <> 3 THEN
    RAISE EXCEPTION 'Expected 3 tenants with " (merged)" in the name, found %. Run 2-merge.sql first.', n;
  END IF;

  -- No row of any table may still point to an old tenant
  FOR col IN
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name IN ('tenantId', 'tenant_id') AND table_name <> 'app_tenants'
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE %I::text = ANY (%L::text[])',
                   col.table_name, col.column_name, old_ids) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Table %.% still has % rows of an old tenant. Nothing is deleted.',
                      col.table_name, col.column_name, n;
    END IF;
  END LOOP;

  -- Billing history: payment events have no tenant column, so search their payload
  SELECT count(*) INTO n FROM payment_events
   WHERE payload::text ~ array_to_string(old_ids, '|');
  IF n > 0 THEN
    RAISE EXCEPTION 'payment_events has % rows of an old tenant. Keep the tenants for the billing history.', n;
  END IF;

  DELETE FROM app_tenants WHERE id::text = ANY (old_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN
    RAISE EXCEPTION 'Deleted % tenants, expected 3. Nothing is deleted.', n;
  END IF;
  RAISE NOTICE 'Deleted the 3 old tenants.';
END
$delete$;

COMMIT;

-- Check: expected 0 rows
SELECT id, name, subdomain FROM app_tenants
 WHERE id IN ('ca415d18-2211-4112-aa12-9b06da4fefd9', '961af8d7-2f81-4e5a-a92e-356acfff6fc9',
              '6ef1dc4b-5b58-4b23-8dc3-cfb8fa2b4e76');
