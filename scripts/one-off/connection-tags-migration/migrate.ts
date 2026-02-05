import { createRequire } from 'node:module';

import { KnexDatabase } from '../../../packages/database/lib/index.js';

const require = createRequire(import.meta.url);
const { buildConnectionTagsBackfillUpdateSql } = require('../../../packages/database/lib/migration-helpers/backfillConnectionTagsSql.cjs');

interface ScriptOptions {
    markMigration: boolean;
}

function parseArgs(argv: string[]): ScriptOptions {
    const opts: ScriptOptions = {
        markMigration: false
    };

    for (const arg of argv) {
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
    const maxBatch = Number(batchResult?.max);
    if (Number.isNaN(maxBatch) || maxBatch === 0) {
        console.error(`Error: Invalid batch result. Expected a positive number, got: ${batchResult?.max}`);
        process.exit(1);
    }
    const nextBatch = maxBatch + 1;

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
    console.log(`Mark migration: ${options.markMigration ? 'true' : 'false'}`);

    try {
        let summary: Record<string, unknown> | undefined;

        await knex.transaction(async (trx) => {
            const updateResult = await trx.raw(updateSql);
            summary = updateResult?.rows?.[0];

            if (options.markMigration) {
                await markMigrationApplied(trx, schemaName);
            }
        });

        if (summary) {
            console.log('[connection tags backfill] summary', summary);
        }

        const updatedCount = Number(summary?.['updated_rows'] ?? 0);
        console.log(`Updated rows: ${updatedCount}`);
    } finally {
        await database.destroy();
    }
}

run().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
