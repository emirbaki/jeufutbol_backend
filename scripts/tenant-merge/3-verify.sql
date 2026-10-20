-- Branch tenant merge, step 3 of 3: verify. Read only. Compare with the preflight output.

-- 1. The workspaces of Jeuhub. Expected: football (default), jeusinema, jeubilgi, jeumagazine.
SELECT w.slug, w.name, w."isDefault"
  FROM workspaces w
 WHERE w."tenantId" = 'c52e7dc3-e6ed-488e-8a3f-18fdbf1d4f64'
 ORDER BY w."isDefault" DESC, w.slug;

-- 2. The rows of each Jeuhub workspace. Each source branch must equal its preflight counts.
SELECT w.slug,
       (SELECT count(*) FROM credentials c        WHERE c."workspaceId" = w.id) AS accounts,
       (SELECT count(*) FROM post p               WHERE p."workspaceId" = w.id) AS posts,
       (SELECT count(*) FROM monitored_profiles m WHERE m."workspaceId" = w.id) AS monitored_profiles,
       (SELECT count(*) FROM insights i           WHERE i."workspaceId" = w.id) AS insights,
       (SELECT count(*) FROM chat_sessions s      WHERE s."workspaceId" = w.id) AS chat_sessions
  FROM workspaces w
 WHERE w."tenantId" = 'c52e7dc3-e6ed-488e-8a3f-18fdbf1d4f64'
 ORDER BY w."isDefault" DESC, w.slug;

-- 3. Rows of Jeuhub with a workspace of another tenant. Expected: 0 rows.
SELECT 'credentials' AS tbl, count(*) FROM credentials c JOIN workspaces w ON w.id = c."workspaceId"
 WHERE c."tenantId"::text = 'c52e7dc3-e6ed-488e-8a3f-18fdbf1d4f64' AND w."tenantId"::text <> c."tenantId"::text
UNION ALL
SELECT 'post', count(*) FROM post p JOIN workspaces w ON w.id = p."workspaceId"
 WHERE p."tenantId"::text = 'c52e7dc3-e6ed-488e-8a3f-18fdbf1d4f64' AND w."tenantId"::text <> p."tenantId"::text;

-- 4. The users of Jeuhub, with their branches
SELECT u.email, u.role, string_agg(w.slug || ':' || m.role, ', ' ORDER BY w.slug) AS branches
  FROM users u
  LEFT JOIN workspace_members m ON m."userId" = u.id
  LEFT JOIN workspaces w ON w.id = m."workspaceId"
 WHERE u."tenantId"::text = 'c52e7dc3-e6ed-488e-8a3f-18fdbf1d4f64'
 GROUP BY u.email, u.role
 ORDER BY u.role, u.email;

-- 5. The API keys of Jeuhub, with their default branch and their branch list
SELECT k.name, k."keyPrefix", k."isActive", d.slug AS default_branch,
       (SELECT string_agg(w.slug, ', ') FROM workspaces w WHERE w.id = ANY (k."workspaceIds")) AS branches
  FROM api_keys k
  LEFT JOIN workspaces d ON d.id = k."defaultWorkspaceId"
 WHERE k."tenantId" = 'c52e7dc3-e6ed-488e-8a3f-18fdbf1d4f64'
 ORDER BY k.name;

-- 6. The old tenants. Expected: names end with " (merged)".
SELECT id, name, subdomain FROM app_tenants
 WHERE id IN ('ca415d18-2211-4112-aa12-9b06da4fefd9', '961af8d7-2f81-4e5a-a92e-356acfff6fc9',
              '6ef1dc4b-5b58-4b23-8dc3-cfb8fa2b4e76');
