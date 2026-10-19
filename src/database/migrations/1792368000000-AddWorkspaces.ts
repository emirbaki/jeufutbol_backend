import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkspaces1792368000000 implements MigrationInterface {
    name = 'AddWorkspaces1792368000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "workspaces" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenantId" uuid NOT NULL,
                "name" varchar(60) NOT NULL,
                "slug" varchar(40) NOT NULL,
                "isDefault" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_workspaces" PRIMARY KEY ("id"),
                CONSTRAINT "FK_workspaces_tenant" FOREIGN KEY ("tenantId") REFERENCES "app_tenants"("id") ON DELETE CASCADE
            )`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_workspaces_tenant_slug" ON "workspaces" ("tenantId", "slug")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_workspaces_tenant_default" ON "workspaces" ("tenantId") WHERE "isDefault" = true`);
        await queryRunner.query(`
            INSERT INTO "workspaces" ("tenantId", "name", "slug", "isDefault")
            SELECT "id", 'General', 'general', true FROM "app_tenants"`);

        // post."tenantId" can be varchar, so compare the tenant IDs as text.
        for (const table of ['credentials', 'post']) {
            await queryRunner.query(`ALTER TABLE "${table}" ADD "workspaceId" uuid`);
            await queryRunner.query(`
                ALTER TABLE "${table}" ADD CONSTRAINT "FK_${table}_workspace"
                FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT`);
            await queryRunner.query(`
                UPDATE "${table}" t SET "workspaceId" = w."id"
                FROM "workspaces" w
                WHERE w."isDefault" = true AND w."tenantId"::text = t."tenantId"::text`);
            await queryRunner.query(`CREATE INDEX "IDX_${table}_tenant_workspace" ON "${table}" ("tenantId", "workspaceId")`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of ['post', 'credentials']) {
            await queryRunner.query(`DROP INDEX "IDX_${table}_tenant_workspace"`);
            await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "FK_${table}_workspace"`);
            await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "workspaceId"`);
        }
        await queryRunner.query(`DROP TABLE "workspaces"`);
    }

}
