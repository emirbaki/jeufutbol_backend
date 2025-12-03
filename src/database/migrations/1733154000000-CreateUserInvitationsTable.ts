import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateUserInvitationsTable1733154000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'user_invitations',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'email',
                        type: 'varchar',
                        length: '255',
                    },
                    {
                        name: 'tenantId',
                        type: 'uuid',
                    },
                    {
                        name: 'invitedByUserId',
                        type: 'uuid',
                    },
                    {
                        name: 'role',
                        type: 'enum',
                        enum: ['ADMIN', 'MANAGER', 'USER'],
                    },
                    {
                        name: 'token',
                        type: 'uuid',
                        isUnique: true,
                    },
                    {
                        name: 'status',
                        type: 'enum',
                        enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'],
                        default: "'PENDING'",
                    },
                    {
                        name: 'expiresAt',
                        type: 'timestamptz',
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
            'user_invitations',
            new TableForeignKey({
                columnNames: ['tenantId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'app_tenants',
                onDelete: 'CASCADE',
            }),
        );

        // Add foreign key for invitedByUserId
        await queryRunner.createForeignKey(
            'user_invitations',
            new TableForeignKey({
                columnNames: ['invitedByUserId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'users',
                onDelete: 'CASCADE',
            }),
        );

        // Add indexes
        await queryRunner.createIndex(
            'user_invitations',
            new TableIndex({
                name: 'IDX_USER_INVITATIONS_TOKEN',
                columnNames: ['token'],
            }),
        );

        await queryRunner.createIndex(
            'user_invitations',
            new TableIndex({
                name: 'IDX_USER_INVITATIONS_TENANT',
                columnNames: ['tenantId'],
            }),
        );

        await queryRunner.createIndex(
            'user_invitations',
            new TableIndex({
                name: 'IDX_USER_INVITATIONS_EMAIL',
                columnNames: ['email'],
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('user_invitations');
    }
}
