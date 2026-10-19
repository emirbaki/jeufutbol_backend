import { MigrationInterface, QueryRunner } from "typeorm";

const PHASE_2_TABLES = ['monitored_profiles', 'insights', 'chat_sessions'];

export class WorkspaceSwitcherPhase21792368200000 implements MigrationInterface {
    name = 'WorkspaceSwitcherPhase21792368200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "activeWorkspaceId" uuid`);
        await queryRunner.query(`
            ALTER TABLE "users" ADD CONSTRAINT "FK_users_active_workspace"
            FOREIGN KEY ("activeWorkspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD "avatarUrl" text`);
        await queryRunner.query(`ALTER TABLE "workspaces" ADD "imageUrl" text`);

        // The tenantId columns are uuid or varchar, so compare them as text.
        for (const table of PHASE_2_TABLES) {
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
        for (const table of [...PHASE_2_TABLES].reverse()) {
            await queryRunner.query(`DROP INDEX "IDX_${table}_tenant_workspace"`);
            await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "FK_${table}_workspace"`);
            await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "workspaceId"`);
        }
        await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN "imageUrl"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatarUrl"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_active_workspace"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "activeWorkspaceId"`);
    }

}
