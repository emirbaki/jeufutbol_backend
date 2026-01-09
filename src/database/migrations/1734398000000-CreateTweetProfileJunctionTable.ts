import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateTweetProfileJunctionTable1734398000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Create the junction table
        await queryRunner.createTable(
            new Table({
                name: 'tweet_monitored_profiles',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'tweetId',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'monitoredProfileId',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'linkedAt',
                        type: 'timestamp',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        // 2. Add unique constraint on (tweetId, monitoredProfileId)
        await queryRunner.createIndex(
            'tweet_monitored_profiles',
            new TableIndex({
                name: 'IDX_tweet_monitored_profile_unique',
                columnNames: ['tweetId', 'monitoredProfileId'],
                isUnique: true,
            }),
        );

        // 3. Add indexes for faster lookups
        await queryRunner.createIndex(
            'tweet_monitored_profiles',
            new TableIndex({
                name: 'IDX_tweet_monitored_profile_tweetId',
                columnNames: ['tweetId'],
            }),
        );

        await queryRunner.createIndex(
            'tweet_monitored_profiles',
            new TableIndex({
                name: 'IDX_tweet_monitored_profile_monitoredProfileId',
                columnNames: ['monitoredProfileId'],
            }),
        );

        // 4. Add foreign keys
        await queryRunner.createForeignKey(
            'tweet_monitored_profiles',
            new TableForeignKey({
                columnNames: ['tweetId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'tweets',
                onDelete: 'CASCADE',
            }),
        );

        await queryRunner.createForeignKey(
            'tweet_monitored_profiles',
            new TableForeignKey({
                columnNames: ['monitoredProfileId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'monitored_profiles',
                onDelete: 'CASCADE',
            }),
        );

        // 5. Migrate existing data: populate junction table from existing monitoredProfileId
        // Only if the columns exist
        const tweetsTable = await queryRunner.getTable('tweets');
        const hasMonitoredProfileId = tweetsTable?.findColumnByName('monitoredProfileId');

        if (hasMonitoredProfileId) {
            await queryRunner.query(`
        INSERT INTO tweet_monitored_profiles ("id", "tweetId", "monitoredProfileId", "linkedAt")
        SELECT uuid_generate_v4(), t.id, t."monitoredProfileId", t."fetchedAt"
        FROM tweets t
        WHERE t."monitoredProfileId" IS NOT NULL
        ON CONFLICT DO NOTHING
      `);

            console.log('Migrated existing tweet-profile relationships to junction table');

            // 6. Drop old columns from tweets table
            // First drop any foreign key constraints
            const foreignKeys = tweetsTable?.foreignKeys || [];
            for (const fk of foreignKeys) {
                if (fk.columnNames.includes('monitoredProfileId') || fk.columnNames.includes('tenantId')) {
                    await queryRunner.dropForeignKey('tweets', fk);
                }
            }

            // Drop monitoredProfileId column
            await queryRunner.dropColumn('tweets', 'monitoredProfileId');
            console.log('Dropped monitoredProfileId column from tweets');
        }

        // Drop tenantId if it exists
        const hasTenantId = tweetsTable?.findColumnByName('tenantId');
        if (hasTenantId) {
            await queryRunner.dropColumn('tweets', 'tenantId');
            console.log('Dropped tenantId column from tweets');
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 1. Re-add columns to tweets table
        await queryRunner.query(`
      ALTER TABLE tweets 
      ADD COLUMN IF NOT EXISTS "monitoredProfileId" uuid,
      ADD COLUMN IF NOT EXISTS "tenantId" uuid
    `);

        // 2. Restore data from junction table (take first profile for each tweet)
        await queryRunner.query(`
      UPDATE tweets t
      SET "monitoredProfileId" = (
        SELECT tmp."monitoredProfileId"
        FROM tweet_monitored_profiles tmp
        WHERE tmp."tweetId" = t.id
        LIMIT 1
      )
    `);

        // 3. Restore tenantId from monitored_profiles
        await queryRunner.query(`
      UPDATE tweets t
      SET "tenantId" = mp."tenantId"
      FROM monitored_profiles mp
      WHERE t."monitoredProfileId" = mp.id
    `);

        // 4. Drop the junction table
        await queryRunner.dropTable('tweet_monitored_profiles');
    }
}
