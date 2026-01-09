import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddAnalyticsTables1735242371000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create post_analytics table
        await queryRunner.createTable(
            new Table({
                name: 'post_analytics',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'publishedPostId',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'platform',
                        type: 'varchar',
                        isNullable: false,
                    },
                    {
                        name: 'views',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'likes',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'comments',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'shares',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'reach',
                        type: 'int',
                        isNullable: true,
                    },
                    {
                        name: 'saves',
                        type: 'int',
                        isNullable: true,
                    },
                    {
                        name: 'engagementRate',
                        type: 'decimal',
                        precision: 5,
                        scale: 2,
                        isNullable: true,
                    },
                    {
                        name: 'rawMetrics',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'fetchedAt',
                        type: 'timestamp',
                        default: 'now()',
                    },
                    {
                        name: 'createdAt',
                        type: 'timestamp',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        // Create index on publishedPostId for faster lookups
        await queryRunner.createIndex(
            'post_analytics',
            new TableIndex({
                name: 'IDX_post_analytics_publishedPostId',
                columnNames: ['publishedPostId'],
            }),
        );

        // Create index on platform for filtering
        await queryRunner.createIndex(
            'post_analytics',
            new TableIndex({
                name: 'IDX_post_analytics_platform',
                columnNames: ['platform'],
            }),
        );

        // Create analytics_settings table
        await queryRunner.createTable(
            new Table({
                name: 'analytics_settings',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'tenantId',
                        type: 'uuid',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'refreshIntervalHours',
                        type: 'int',
                        default: 6,
                    },
                    {
                        name: 'lastRefreshAt',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'createdAt',
                        type: 'timestamp',
                        default: 'now()',
                    },
                    {
                        name: 'updatedAt',
                        type: 'timestamp',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        // Create index on tenantId
        await queryRunner.createIndex(
            'analytics_settings',
            new TableIndex({
                name: 'IDX_analytics_settings_tenantId',
                columnNames: ['tenantId'],
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex('analytics_settings', 'IDX_analytics_settings_tenantId');
        await queryRunner.dropTable('analytics_settings');

        await queryRunner.dropIndex('post_analytics', 'IDX_post_analytics_platform');
        await queryRunner.dropIndex('post_analytics', 'IDX_post_analytics_publishedPostId');
        await queryRunner.dropTable('post_analytics');
    }
}
