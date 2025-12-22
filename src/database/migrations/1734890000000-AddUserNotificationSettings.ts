import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUserNotificationSettings1734890000000
    implements MigrationInterface {
    name = 'AddUserNotificationSettings1734890000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add notification settings columns to users table
        await queryRunner.addColumns('users', [
            new TableColumn({
                name: 'notifyOnPublish',
                type: 'boolean',
                default: true,
                isNullable: false,
            }),
            new TableColumn({
                name: 'notifyOnFail',
                type: 'boolean',
                default: true,
                isNullable: false,
            }),
            new TableColumn({
                name: 'notifyWeeklyReport',
                type: 'boolean',
                default: true,
                isNullable: false,
            }),
            new TableColumn({
                name: 'notifyNewInsights',
                type: 'boolean',
                default: true,
                isNullable: false,
            }),
        ]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove notification settings columns
        await queryRunner.dropColumn('users', 'notifyOnPublish');
        await queryRunner.dropColumn('users', 'notifyOnFail');
        await queryRunner.dropColumn('users', 'notifyWeeklyReport');
        await queryRunner.dropColumn('users', 'notifyNewInsights');
    }
}
