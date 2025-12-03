import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateApiKeysTable1733154100000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'api_keys',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'name',
                        type: 'varchar',
                        length: '255',
                    },
                    {
                        name: 'key',
                        type: 'varchar',
                        length: '255',
                        isUnique: true,
                    },
                    {
                        name: 'keyPrefix',
                        type: 'varchar',
                        length: '50',
                    },
                    {
                        name: 'tenantId',
                        type: 'uuid',
                    },
                    {
                        name: 'createdByUserId',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'scopes',
                        type: 'text',
                        isArray: true,
                        default: "'{}'",
                    },
                    {
                        name: 'isActive',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'lastUsedAt',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'expiresAt',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'metadata',
                        type: 'jsonb',
                        default: "'{}'",
                    },
                    {
                        name: 'createdAt',
                        type: 'timestamptz',
                        default: 'now()',
                    },
                    {
                        name: 'updatedAt',
                        type: 'timestamptz',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        // Add foreign key for tenantId
        await queryRunner.createForeignKey(
            'api_keys',
            new TableForeignKey({
                columnNames: ['tenantId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'app_tenants',
                onDelete: 'CASCADE',
            }),
        );

        // Add foreign key for createdByUserId
        await queryRunner.createForeignKey(
            'api_keys',
            new TableForeignKey({
                columnNames: ['createdByUserId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'users',
                onDelete: 'SET NULL',
            }),
        );

        // Add indexes
        await queryRunner.createIndex(
            'api_keys',
            new TableIndex({
                name: 'IDX_API_KEYS_KEY',
                columnNames: ['key'],
            }),
        );

        await queryRunner.createIndex(
            'api_keys',
            new TableIndex({
                name: 'IDX_API_KEYS_TENANT',
                columnNames: ['tenantId'],
            }),
        );

        await queryRunner.createIndex(
            'api_keys',
            new TableIndex({
                name: 'IDX_API_KEYS_ACTIVE',
                columnNames: ['isActive'],
                where: 'isActive = true',
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('api_keys');
    }
}
