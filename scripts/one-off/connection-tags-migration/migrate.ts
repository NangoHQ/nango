import { createRequire } from 'node:module';

import { KnexDatabase } from '../../../packages/database/lib/index.js';

const require = createRequire(import.meta.url);
const { buildConnectionTagsBackfillCte } = require('../../../packages/database/lib/migration-helpers/backfillConnectionTagsSql.cjs');

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
    const cte = buildConnectionTagsBackfillCte();
    const schemaName = database.schema();

    console.log('Starting connection tags migration');
    console.log(`Dry run: ${options.dryRun ? 'true' : 'false'}`);
    console.log(`Mark migration: ${options.markMigration ? 'true' : 'false'}`);

    try {
        const countSql = `${cte}
SELECT COUNT(*)::int AS rows_to_update
FROM merged
WHERE merged_tags IS DISTINCT FROM existing_tags;`;
        const countResult = await knex.raw(countSql);
        const rowsToUpdate = countResult.rows?.[0]?.rows_to_update ?? 0;
        console.log(`Rows to update: ${rowsToUpdate}`);

        if (!options.dryRun && rowsToUpdate > 0) {
            const updateSql = `${cte}
UPDATE _nango_connections AS c
SET tags = merged.merged_tags
FROM merged
WHERE c.id = merged.id
  AND merged.merged_tags IS DISTINCT FROM c.tags;`;
            const updateResult = await knex.raw(updateSql);
            const updatedCount = updateResult.rowCount ?? 0;
            console.log(`Updated rows: ${updatedCount}`);
        }

        if (!options.dryRun && options.markMigration) {
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
