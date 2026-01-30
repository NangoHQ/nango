import { createRequire } from 'node:module';

import { KnexDatabase } from '../../../packages/database/lib/index.js';

const require = createRequire(import.meta.url);
const { buildConnectionTagsBackfillUpdateSql } = require('../../../packages/database/lib/migration-helpers/backfillConnectionTagsSql.cjs');

interface ScriptOptions {
    dryRun: boolean;
    markMigration: boolean;
}

function parseArgs(argv: string[]): ScriptOptions {
    const opts: ScriptOptions = {
        dryRun: false,
        markMigration: false
    };

    for (const arg of argv) {
        if (arg === '--dry-run') {
            opts.dryRun = true;
            continue;
        }

        if (arg === '--mark-migration') {
            opts.markMigration = true;
            continue;
        }
    }

    return opts;
}

async function markMigrationApplied(knex: KnexDatabase['knex'], schemaName: string) {
    const migrationName = '20260128120000_backfill_connection_tags.cjs';
    const migrationTable = '_nango_auth_migrations';

    const existing = await knex.withSchema(schemaName).select('name').from(migrationTable).where({ name: migrationName }).first();
    if (existing) {
        console.log(`Migration already marked: ${migrationName}`);
        return;
    }

    const batchResult = await knex.withSchema(schemaName).from(migrationTable).max('batch as max').first();
    const maxBatch = Number(batchResult?.max ?? 0);
    const nextBatch = Number.isNaN(maxBatch) ? 1 : maxBatch + 1;

    await knex.withSchema(schemaName).from(migrationTable).insert({
        name: migrationName,
        batch: nextBatch,
        migration_time: new Date()
    });

    console.log(`Migration marked as applied: ${migrationName}`);
}

async function run() {
    const options = parseArgs(process.argv.slice(2));

    const database = new KnexDatabase({ timeoutMs: 60000 });
    const knex = database.knex;
    const updateSql = buildConnectionTagsBackfillUpdateSql();
    const schemaName = database.schema();

    console.log('Starting connection tags migration');
    console.log(`Dry run: ${options.dryRun ? 'true' : 'false'}`);
    console.log(`Mark migration: ${options.markMigration ? 'true' : 'false'}`);

    try {
        if (options.dryRun) {
            const trx = await knex.transaction();
            try {
                const updateResult = await trx.raw(updateSql);
                const updatedCount = updateResult.rowCount ?? 0;
                console.log(`Dry run updated rows (rolled back): ${updatedCount}`);
            } finally {
                await trx.rollback();
            }
            return;
        }

        const updateResult = await knex.raw(updateSql);
        const updatedCount = updateResult.rowCount ?? 0;
        console.log(`Updated rows: ${updatedCount}`);

        if (options.markMigration) {
            await markMigrationApplied(knex, schemaName);
        }
    } finally {
        await database.destroy();
    }
}

run().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
