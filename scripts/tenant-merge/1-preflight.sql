-- Branch tenant merge, step 1 of 3: preflight. Read only. Save the output of each query.
-- Source tenants: jeusinema, jeubilgi, jeumagazine. Target: Jeuhub (subdomain main).

-- 1. The four tenants
SELECT id, name, subdomain FROM app_tenants
 WHERE id IN ('c52e7dc3-e6ed-488e-8a3f-18fdbf1d4f64', 'ca415d18-2211-4112-aa12-9b06da4fefd9',
              '961af8d7-2f81-4e5a-a92e-356acfff6fc9', '6ef1dc4b-5b58-4b23-8dc3-cfb8fa2b4e76')
 ORDER BY subdomain;

-- 2. Every table with a "tenantId" column. The merge moves the tables marked moved = true.
--    A table with moved = false and rows of a source tenant (query 3) needs a decision.
SELECT c.table_name, c.data_type,
       c.table_name IN ('users','credentials','post','published_posts','insights','monitored_profiles',
                        'chat_sessions','llm_credentials','api_keys','user_invitations','workspaces',
                        'analytics_settings','app_tenants') AS moved
  FROM information_schema.columns c
 WHERE c.table_schema = 'public' AND c.column_name = 'tenantId'
 ORDER BY moved, c.table_name;

-- 3. Row count of each table with a "tenantId" column, for each of the four tenants
DO $count$
DECLARE
  tbl text;
  n bigint;
  t record;
BEGIN
  FOR tbl IN SELECT table_name FROM information_schema.columns
              WHERE table_schema = 'public' AND column_name = 'tenantId' ORDER BY table_name LOOP
    FOR t IN SELECT * FROM (VALUES
        ('c52e7dc3-e6ed-488e-8a3f-18fdbf1d4f64', 'main'),
        ('ca415d18-2211-4112-aa12-9b06da4fefd9', 'jeusinema'),
        ('961af8d7-2f81-4e5a-a92e-356acfff6fc9', 'jeubilgi'),
        ('6ef1dc4b-5b58-4b23-8dc3-cfb8fa2b4e76', 'jeumagazine')) AS x(id, sub) LOOP
      EXECUTE format('SELECT count(*) FROM %I WHERE "tenantId"::text = %L', tbl, t.id) INTO n;
      IF n > 0 THEN
        RAISE NOTICE '% | % | %', rpad(tbl, 28), rpad(t.sub, 12), n;
      END IF;
    END LOOP;
  END LOOP;
END
$count$;

-- 4. The users of the source tenants
SELECT t.subdomain, u.email, u.role, u."isActive"
  FROM users u JOIN app_tenants t ON t.id::text = u."tenantId"::text
 WHERE t.subdomain IN ('jeusinema', 'jeubilgi', 'jeumagazine')
 ORDER BY t.subdomain, u.email;

-- 5. The active API keys of the source tenants
SELECT t.subdomain, k.name, k."keyPrefix", k."workspaceIds", k."defaultWorkspaceId"
  FROM api_keys k JOIN app_tenants t ON t.id::text = k."tenantId"::text
 WHERE t.subdomain IN ('jeusinema', 'jeubilgi', 'jeumagazine') AND k."isActive"
 ORDER BY t.subdomain, k.name;

-- 6. The scheduled posts of the source tenants
SELECT t.subdomain, p.id, p."scheduledFor"
  FROM post p JOIN app_tenants t ON t.id::text = p."tenantId"::text
 WHERE t.subdomain IN ('jeusinema', 'jeubilgi', 'jeumagazine') AND p.status::text ILIKE 'scheduled'
 ORDER BY p."scheduledFor";

-- 7. The subscriptions of the source tenants (they stay on the old tenants, M-D6)
SELECT t.subdomain, s.status
  FROM subscriptions s JOIN app_tenants t ON t.id::text = s.tenant_id::text
 WHERE t.subdomain IN ('jeusinema', 'jeubilgi', 'jeumagazine');

-- 8. The workspaces of the four tenants
SELECT t.subdomain, w.id, w.name, w.slug, w."isDefault"
  FROM workspaces w JOIN app_tenants t ON t.id = w."tenantId"
 WHERE t.subdomain IN ('main', 'jeusinema', 'jeubilgi', 'jeumagazine')
 ORDER BY t.subdomain, w."isDefault" DESC, w.name;

-- 9. Branch memberships of the source users
SELECT t.subdomain, u.email, m.role, w.slug
  FROM workspace_members m
  JOIN users u ON u.id = m."userId"
  JOIN workspaces w ON w.id = m."workspaceId"
  JOIN app_tenants t ON t.id::text = u."tenantId"::text
 WHERE t.subdomain IN ('jeusinema', 'jeubilgi', 'jeumagazine')
 ORDER BY t.subdomain, u.email;
