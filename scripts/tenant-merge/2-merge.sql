-- Branch tenant merge. Run after a backup. One transaction. Stops on the first failed check.
BEGIN;

DO $merge$
DECLARE
  target_id      uuid    := 'c52e7dc3-e6ed-488e-8a3f-18fdbf1d4f64';
  target_ws_name text    := 'Football';
  target_ws_slug text    := 'football';
  demote_admins  boolean := false;  -- M-D3: set true to make the branch admins MANAGER
  moved_tables   text[]  := ARRAY['users','credentials','post','published_posts','insights',
                                  'monitored_profiles','chat_sessions','llm_credentials',
                                  'api_keys','user_invitations'];
  src record;
  tbl text;
  ws_id uuid;
  n bigint;
BEGIN
  -- Checks on the target
  IF NOT EXISTS (SELECT 1 FROM app_tenants WHERE id = target_id AND subdomain = 'main') THEN
    RAISE EXCEPTION 'Target tenant % with subdomain main not found.', target_id;
  END IF;
  IF to_regclass('public.workspaces') IS NULL THEN
    RAISE EXCEPTION 'Table workspaces not found. Deploy workspaces phase 1 first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'api_keys' AND column_name = 'defaultWorkspaceId') THEN
    RAISE EXCEPTION 'Column api_keys.defaultWorkspaceId not found. Deploy workspaces Phase 3 first.';
  END IF;
  IF to_regclass('public.workspace_members') IS NULL THEN
    RAISE EXCEPTION 'Table workspace_members not found. Deploy workspaces Phase 3 first.';
  END IF;
  FOREACH tbl IN ARRAY moved_tables LOOP
    IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
      RAISE EXCEPTION 'Table % not found.', tbl;
    END IF;
  END LOOP;

  -- Target default workspace becomes Football
  SELECT id INTO ws_id FROM workspaces WHERE "tenantId" = target_id AND "isDefault";
  IF ws_id IS NULL THEN
    INSERT INTO workspaces ("tenantId", name, slug, "isDefault")
      VALUES (target_id, target_ws_name, target_ws_slug, true) RETURNING id INTO ws_id;
  ELSE
    UPDATE workspaces SET name = target_ws_name, slug = target_ws_slug, "updatedAt" = now() WHERE id = ws_id;
  END IF;
  UPDATE credentials SET "workspaceId" = ws_id WHERE "tenantId"::text = target_id::text AND "workspaceId" IS NULL;
  UPDATE post        SET "workspaceId" = ws_id WHERE "tenantId"::text = target_id::text AND "workspaceId" IS NULL;

  FOR src IN
    SELECT * FROM (VALUES
      ('ca415d18-2211-4112-aa12-9b06da4fefd9'::uuid, 'jeusinema',   'JeuSinema',   'jeusinema'),
      ('961af8d7-2f81-4e5a-a92e-356acfff6fc9'::uuid, 'jeubilgi',    'JeuBilgi',    'jeubilgi'),
      ('6ef1dc4b-5b58-4b23-8dc3-cfb8fa2b4e76'::uuid, 'jeumagazine', 'JeuMagazine', 'jeumagazine')
    ) AS t(tenant_id, subdomain, ws_name, ws_slug)
  LOOP
    -- Checks on the source
    IF NOT EXISTS (SELECT 1 FROM app_tenants WHERE id = src.tenant_id AND subdomain = src.subdomain) THEN
      RAISE EXCEPTION 'Source tenant % (%) not found.', src.tenant_id, src.subdomain;
    END IF;
    SELECT count(*) INTO n FROM workspaces WHERE "tenantId" = src.tenant_id;
    IF n > 1 THEN
      RAISE EXCEPTION 'Source tenant % has % workspaces. Move them by hand first.', src.subdomain, n;
    END IF;
    IF EXISTS (SELECT 1 FROM workspaces WHERE "tenantId" = target_id AND slug = src.ws_slug) THEN
      RAISE EXCEPTION 'Target already has a workspace with slug %.', src.ws_slug;
    END IF;

    -- Source default workspace (make it when the app never made it)
    SELECT id INTO ws_id FROM workspaces WHERE "tenantId" = src.tenant_id AND "isDefault";
    IF ws_id IS NULL THEN
      INSERT INTO workspaces ("tenantId", name, slug, "isDefault")
        VALUES (src.tenant_id, src.ws_name, src.ws_slug, true) RETURNING id INTO ws_id;
    END IF;
    UPDATE credentials SET "workspaceId" = ws_id WHERE "tenantId"::text = src.tenant_id::text AND "workspaceId" IS NULL;
    UPDATE post        SET "workspaceId" = ws_id WHERE "tenantId"::text = src.tenant_id::text AND "workspaceId" IS NULL;
    FOREACH tbl IN ARRAY ARRAY['monitored_profiles','insights','chat_sessions'] LOOP
      EXECUTE format('UPDATE %I SET "workspaceId" = %L WHERE "tenantId"::text = %L AND "workspaceId" IS NULL',
                     tbl, ws_id, src.tenant_id::text);
    END LOOP;

    -- API keys default to the branch workspace and reach only it (M-D4)
    UPDATE api_keys SET "defaultWorkspaceId" = ws_id
      WHERE "tenantId" = src.tenant_id AND "defaultWorkspaceId" IS NULL;
    UPDATE api_keys SET "workspaceIds" = ARRAY[ws_id]
      WHERE "tenantId" = src.tenant_id;

    -- Non-admin users become members of their branch workspace (M-D4), before the users move
    INSERT INTO workspace_members ("workspaceId", "userId", role)
      SELECT ws_id, u.id, u.role::text::workspace_role_enum
        FROM users u
       WHERE u."tenantId"::text = src.tenant_id::text AND u.role::text IN ('MANAGER', 'USER')
      ON CONFLICT DO NOTHING;

    -- Optional role change for the branch admins
    IF demote_admins THEN
      UPDATE users SET role = 'MANAGER' WHERE "tenantId"::text = src.tenant_id::text AND role = 'ADMIN';
      INSERT INTO workspace_members ("workspaceId", "userId", role)
        SELECT ws_id, u.id, 'MANAGER'::workspace_role_enum
          FROM users u
         WHERE u."tenantId"::text = src.tenant_id::text AND u.role::text = 'MANAGER'
        ON CONFLICT DO NOTHING;
    END IF;

    -- Move the rows. %L is an untyped literal, so it fits uuid and varchar columns.
    FOREACH tbl IN ARRAY moved_tables LOOP
      EXECUTE format('UPDATE %I SET "tenantId" = %L WHERE "tenantId"::text = %L',
                     tbl, target_id::text, src.tenant_id::text);
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE '% -> %: % rows moved', src.subdomain, tbl, n;
    END LOOP;

    -- Move the workspace itself
    UPDATE workspaces
       SET "tenantId" = target_id, name = src.ws_name, slug = src.ws_slug,
           "isDefault" = false, "updatedAt" = now()
     WHERE id = ws_id;

    DELETE FROM analytics_settings WHERE "tenantId"::text = src.tenant_id::text;
    UPDATE app_tenants SET name = name || ' (merged)', "updatedAt" = now()
     WHERE id = src.tenant_id AND name NOT LIKE '% (merged)';
  END LOOP;

  -- Final check: no moved table keeps a source tenant
  FOREACH tbl IN ARRAY moved_tables LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "tenantId"::text IN (%L, %L, %L)', tbl,
                   'ca415d18-2211-4112-aa12-9b06da4fefd9',
                   '961af8d7-2f81-4e5a-a92e-356acfff6fc9',
                   '6ef1dc4b-5b58-4b23-8dc3-cfb8fa2b4e76') INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Table % still has % rows of a source tenant.', tbl, n;
    END IF;
  END LOOP;
END
$merge$;

COMMIT;
