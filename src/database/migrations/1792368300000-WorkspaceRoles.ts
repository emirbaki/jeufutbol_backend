import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRoles1792368300000 implements MigrationInterface {
    name = 'WorkspaceRoles1792368300000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "workspace_role_enum" AS ENUM ('MANAGER', 'USER')`);
        await queryRunner.query(`
            CREATE TABLE "workspace_members" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "workspaceId" uuid NOT NULL,
                "userId" uuid NOT NULL,
                "role" "workspace_role_enum" NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_workspace_members" PRIMARY KEY ("id"),
                CONSTRAINT "FK_workspace_members_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_workspace_members_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
            )`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_workspace_members_pair" ON "workspace_members" ("workspaceId", "userId")`);

        await queryRunner.query(`ALTER TABLE "user_invitations" ADD "workspaceId" uuid`);
        await queryRunner.query(`
            ALTER TABLE "user_invitations" ADD CONSTRAINT "FK_user_invitations_workspace"
            FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_invitations" ADD "workspaceRole" "workspace_role_enum"`);

        await queryRunner.query(`ALTER TABLE "api_keys" ADD "workspaceIds" uuid[] NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "api_keys" ADD "defaultWorkspaceId" uuid`);
        await queryRunner.query(`
            ALTER TABLE "api_keys" ADD CONSTRAINT "FK_api_keys_default_workspace"
            FOREIGN KEY ("defaultWorkspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL`);

        // Existing non-admins keep their access: a membership in the default branch with their role.
        await queryRunner.query(`
            INSERT INTO "workspace_members" ("workspaceId", "userId", "role")
            SELECT w."id", u."id", u."role"::text::"workspace_role_enum"
            FROM "users" u
            JOIN "workspaces" w ON w."isDefault" = true AND w."tenantId"::text = u."tenantId"::text
            WHERE u."role"::text IN ('MANAGER', 'USER')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "api_keys" DROP CONSTRAINT "FK_api_keys_default_workspace"`);
        await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "defaultWorkspaceId"`);
        await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "workspaceIds"`);
        await queryRunner.query(`ALTER TABLE "user_invitations" DROP COLUMN "workspaceRole"`);
        await queryRunner.query(`ALTER TABLE "user_invitations" DROP CONSTRAINT "FK_user_invitations_workspace"`);
        await queryRunner.query(`ALTER TABLE "user_invitations" DROP COLUMN "workspaceId"`);
        await queryRunner.query(`DROP INDEX "UQ_workspace_members_pair"`);
        await queryRunner.query(`DROP TABLE "workspace_members"`);
        await queryRunner.query(`DROP TYPE "workspace_role_enum"`);
    }

}
