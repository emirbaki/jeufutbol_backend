// Local development only. Creates the data for the workspaces Phase 3 hand check:
// a second branch "Cinema", a USER of Cinema only, and a MANAGER of the default branch.
// It writes the test passwords to phase3-test-users.local.json next to this file (git-ignored).
// Run from backend/: node scripts/dev-seed/phase3-hand-check.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

if (process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1') {
  console.error('Stop: DB_HOST is not localhost. This script is for a local database only.');
  process.exit(1);
}

const OUT = path.join(__dirname, 'phase3-test-users.local.json');

(async () => {
  const db = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  });
  await db.connect();
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  const general = await one(`SELECT id, "tenantId" FROM workspaces WHERE "isDefault" ORDER BY "createdAt" LIMIT 1`);
  if (!general) throw new Error('No default workspace. Start the backend once first.');
  const tenantId = general.tenantId;

  const cinema =
    (await one(`SELECT id FROM workspaces WHERE "tenantId" = $1 AND slug = 'cinema'`, [tenantId])) ??
    (await one(
      `INSERT INTO workspaces ("tenantId", name, slug, "isDefault") VALUES ($1, 'Cinema', 'cinema', false) RETURNING id`,
      [tenantId],
    ));

  const saved = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const people = [
    { email: 'p3-user@jeuhub.test', firstName: 'Phase3', lastName: 'User', role: 'USER', branch: cinema.id, branchRole: 'USER' },
    { email: 'p3-manager@jeuhub.test', firstName: 'Phase3', lastName: 'Manager', role: 'MANAGER', branch: general.id, branchRole: 'MANAGER' },
  ];
  for (const p of people) {
    const password = saved[p.email] ?? crypto.randomBytes(9).toString('base64url');
    saved[p.email] = password;
    const hash = await bcrypt.hash(password, 10);
    const user = await one(
      `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "tenantId", role, "isVerified", "isActive")
       VALUES ($1, $2, $3, $4, $5, $6, true, true)
       ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = EXCLUDED.role
       RETURNING id`,
      [p.email, hash, p.firstName, p.lastName, tenantId, p.role],
    );
    await db.query(`DELETE FROM workspace_members WHERE "userId" = $1`, [user.id]);
    await db.query(
      `INSERT INTO workspace_members ("workspaceId", "userId", role) VALUES ($1, $2, $3)`,
      [p.branch, user.id, p.branchRole],
    );
    console.log(`${p.email}: ${p.role}, ${p.branchRole} of ${p.branch === cinema.id ? 'Cinema' : 'General'}`);
  }
  fs.writeFileSync(OUT, JSON.stringify(saved, null, 2));
  console.log(`Passwords: ${OUT}`);
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
