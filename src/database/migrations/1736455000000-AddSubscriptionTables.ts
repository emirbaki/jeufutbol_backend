import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddSubscriptionTables1736455000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create subscriptions table
        await queryRunner.createTable(
            new Table({
                name: 'subscriptions',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'tenant_id',
                        type: 'uuid',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'lemon_squeezy_subscription_id',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'lemon_squeezy_customer_id',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'status',
                        type: 'enum',
                        enum: ['active', 'on_trial', 'cancelled', 'expired', 'past_due', 'unpaid', 'paused'],
                        default: "'active'",
                    },
                    {
                        name: 'plan',
                        type: 'enum',
                        enum: ['free', 'pro', 'enterprise'],
                        default: "'free'",
                    },
                    {
                        name: 'billing_cycle',
                        type: 'enum',
                        enum: ['monthly', 'yearly'],
                        default: "'monthly'",
                    },
                    {
                        name: 'current_period_start',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'current_period_end',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'cancel_at_period_end',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'is_grandfathered',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'trial_ends_at',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamptz',
                        default: 'now()',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamptz',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        // Create index on tenant_id
        await queryRunner.createIndex(
            'subscriptions',
            new TableIndex({
                name: 'IDX_subscriptions_tenant_id',
                columnNames: ['tenant_id'],
            }),
        );

        // Create index on lemon_squeezy_subscription_id
        await queryRunner.createIndex(
            'subscriptions',
            new TableIndex({
                name: 'IDX_subscriptions_lemon_squeezy_subscription_id',
                columnNames: ['lemon_squeezy_subscription_id'],
            }),
        );

        // Create foreign key to app_tenants
        await queryRunner.createForeignKey(
            'subscriptions',
            new TableForeignKey({
                columnNames: ['tenant_id'],
                referencedTableName: 'app_tenants',
                referencedColumnNames: ['id'],
                onDelete: 'CASCADE',
            }),
        );

        // Create payment_events table for webhook audit logging
        await queryRunner.createTable(
            new Table({
                name: 'payment_events',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'event_type',
                        type: 'varchar',
                        isNullable: false,
                    },
                    {
                        name: 'lemon_squeezy_event_id',
                        type: 'varchar',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'subscription_id',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'payload',
                        type: 'jsonb',
                        isNullable: false,
                    },
                    {
                        name: 'status',
                        type: 'enum',
                        enum: ['processed', 'failed'],
                        default: "'processed'",
                    },
                    {
                        name: 'error_message',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'processed_at',
                        type: 'timestamptz',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        // Create index on event_type
        await queryRunner.createIndex(
            'payment_events',
            new TableIndex({
                name: 'IDX_payment_events_event_type',
                columnNames: ['event_type'],
            }),
        );

        // Create index on lemon_squeezy_event_id
        await queryRunner.createIndex(
            'payment_events',
            new TableIndex({
                name: 'IDX_payment_events_lemon_squeezy_event_id',
                columnNames: ['lemon_squeezy_event_id'],
            }),
        );

        // =============================================
        // GRANDFATHER EXISTING TENANTS AS PRO USERS
        // =============================================
        // Insert Pro subscriptions for all existing tenants that don't have one
        await queryRunner.query(`
            INSERT INTO subscriptions (id, tenant_id, status, plan, billing_cycle, is_grandfathered, current_period_end, created_at, updated_at)
            SELECT 
                uuid_generate_v4(),
                t.id,
                'active',
                'pro',
                'monthly',
                true,
                '2099-12-31'::timestamptz,
                now(),
                now()
            FROM app_tenants t
            WHERE NOT EXISTS (
                SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop payment_events indexes
        await queryRunner.dropIndex('payment_events', 'IDX_payment_events_lemon_squeezy_event_id');
        await queryRunner.dropIndex('payment_events', 'IDX_payment_events_event_type');
        await queryRunner.dropTable('payment_events');

        // Drop subscriptions foreign key, indexes, and table
        const table = await queryRunner.getTable('subscriptions');
        const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('tenant_id') !== -1);
        if (foreignKey) {
            await queryRunner.dropForeignKey('subscriptions', foreignKey);
        }
        await queryRunner.dropIndex('subscriptions', 'IDX_subscriptions_lemon_squeezy_subscription_id');
        await queryRunner.dropIndex('subscriptions', 'IDX_subscriptions_tenant_id');
        await queryRunner.dropTable('subscriptions');
    }
}
