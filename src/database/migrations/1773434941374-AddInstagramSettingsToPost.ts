import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInstagramSettingsToPost1773434941374 implements MigrationInterface {
    name = 'AddInstagramSettingsToPost1773434941374'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "post" ADD "instagramSettings" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "post" DROP COLUMN "instagramSettings"`);
    }

}
