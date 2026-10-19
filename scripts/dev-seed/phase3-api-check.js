// Local development only. API checks of the workspaces Phase 3 hand check.
// Needs phase3-hand-check.js first, and the backend on http://localhost:3000.
// It makes a test API key limited to the Cinema branch (created by the first admin), and
// deletes the key and the test invitations at the end. It prints no password or key.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const API = 'http://localhost:3000';
const pw = JSON.parse(fs.readFileSync(path.join(__dirname, 'phase3-test-users.local.json'), 'utf8'));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);

async function gql(query, variables, token, workspace) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (workspace) headers['x-workspace-id'] = workspace;
  const res = await fetch(`${API}/graphql`, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  return res.json();
}
const err = (r) => r.errors?.[0]?.message ?? '';
const login = async (email) =>
  (await gql(`mutation($e:String!,$p:String!){login(email:$e,password:$p){accessToken}}`, { e: email, p: pw[email] }))
    .data?.login?.accessToken;

(async () => {
  const db = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  });
  await db.connect();
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];
  const general = await one(`SELECT id, "tenantId" FROM workspaces WHERE "isDefault" ORDER BY "createdAt" LIMIT 1`);
  const cinema = await one(`SELECT id FROM workspaces WHERE "tenantId" = $1 AND slug = 'cinema'`, [general.tenantId]);
  const post = await one(`SELECT id FROM post WHERE "workspaceId" = $1 LIMIT 1`, [general.id]);

  // USER of Cinema only
  const user = await login('p3-user@jeuhub.test');
  check('USER can log in', !!user);
  const uw = await gql(`{workspaces{id name}}`, {}, user);
  check('USER sees only Cinema', JSON.stringify(uw.data?.workspaces?.map((w) => w.name)) === '["Cinema"]', JSON.stringify(uw.data?.workspaces?.map((w) => w.name) ?? err(uw)));
  const up = await gql(`{getUserPosts(limit:5){id}}`, {}, user, general.id);
  check('USER with the General header gets not found', /not found/i.test(err(up)) && !/general/i.test(err(up)), err(up));
  if (post) {
    const gp = await gql(`query($id:String!){getPost(postId:$id){id}}`, { id: post.id }, user, cinema.id);
    check('USER cannot open a General post by ID', /not found/i.test(err(gp)), err(gp) || 'returned data');
  } else {
    check('USER cannot open a General post by ID', true, 'skipped: no post in General');
  }
  const ut = await gql(`{getOrganizationUsers{id}}`, {}, user);
  check('USER cannot list the team', !!err(ut), err(ut));

  // MANAGER of General
  const mgr = await login('p3-manager@jeuhub.test');
  check('MANAGER can log in', !!mgr);
  const mw = await gql(`{workspaces{name}}`, {}, mgr);
  check('MANAGER sees only General', JSON.stringify(mw.data?.workspaces?.map((w) => w.name)) === '["General"]', JSON.stringify(mw.data?.workspaces?.map((w) => w.name) ?? err(mw)));
  const invite = `mutation($i:InviteUserInput!){inviteUser(input:$i){id}}`;
  const ok = await gql(invite, { i: { email: 'p3-invite-a@jeuhub.test', role: 'USER', workspaceId: general.id, workspaceRole: 'USER' } }, mgr);
  check('MANAGER can invite into General', !!ok.data?.inviteUser, err(ok));
  const bad = await gql(invite, { i: { email: 'p3-invite-b@jeuhub.test', role: 'USER', workspaceId: cinema.id, workspaceRole: 'USER' } }, mgr);
  check('MANAGER cannot invite into Cinema', !!err(bad), err(bad));
  const adm = await gql(invite, { i: { email: 'p3-invite-c@jeuhub.test', role: 'ADMIN' } }, mgr);
  check('MANAGER cannot invite an admin', !!err(adm), err(adm));
  const team = await gql(`{getOrganizationUsers{email workspaceMemberships{workspace{name}}}}`, {}, mgr);
  const shown = (team.data?.getOrganizationUsers ?? []).map((u) => u.email);
  check('MANAGER team list hides the Cinema-only USER', !!team.data && !shown.includes('p3-user@jeuhub.test'), err(team) || `${shown.length} people`);

  // API key limited to Cinema, created by the first admin
  const admin = await one(`SELECT id FROM users WHERE "tenantId" = $1 AND role = 'ADMIN' ORDER BY "createdAt" LIMIT 1`, [general.tenantId]);
  const plain = 'jeu_p3test_' + crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  const key = await one(
    `INSERT INTO api_keys (name, key, "keyPrefix", "tenantId", "createdByUserId", scopes, "isActive", "workspaceIds", "defaultWorkspaceId")
     VALUES ('Phase 3 hand check', $1, 'jeu_p3', $2, $3, $4, true, $5, $6) RETURNING id`,
    [hash, general.tenantId, admin.id, ['credentials:read', 'posts:read', 'posts:write'], [cinema.id], cinema.id],
  );
  try {
    const kw = await (await fetch(`${API}/graphql`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'jeu-api-key': plain },
      body: JSON.stringify({ query: `{workspaces{name}}` }),
    })).json();
    check('Cinema key: GraphQL workspaces gives Cinema only', JSON.stringify(kw.data?.workspaces?.map((w) => w.name)) === '["Cinema"]', JSON.stringify(kw.data?.workspaces?.map((w) => w.name) ?? err(kw)));

    const mcp = async (body) => {
      const res = await fetch(`${API}/api/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${plain}` },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const line = text.split('\n').find((l) => l.startsWith('data:'));
      return JSON.parse(line ? line.slice(5) : text);
    };
    await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'p3', version: '1' } } });
    const lw = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_workspaces', arguments: {} } });
    const content = lw.result?.structuredContent ?? JSON.parse(lw.result?.content?.[0]?.text ?? '{}');
    const names = (content.workspaces ?? []).map((w) => w.name);
    check('Cinema key: MCP list_workspaces gives one branch', JSON.stringify(names) === '["Cinema"]', JSON.stringify(names.length ? names : lw.error ?? lw.result));
    if (post) {
      const gp = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_post', arguments: { postId: post.id } } });
      const text = JSON.stringify(gp.result ?? gp.error);
      check('Cinema key: MCP get_post of a General post is not found', /Post not found/i.test(text), text.slice(0, 120));
    }
  } finally {
    await db.query(`DELETE FROM api_keys WHERE id = $1`, [key.id]);
    await db.query(`DELETE FROM user_invitations WHERE email LIKE 'p3-invite-%@jeuhub.test'`);
    await db.end();
  }
  console.log(results.join('\n'));
})().catch((e) => { console.error(e.message); process.exit(1); });
