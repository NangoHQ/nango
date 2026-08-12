import fs from 'node:fs/promises';
import path from 'node:path';

import { Err, Ok, stringifyError } from '@nangohq/utils';

import type { ClickHouseClient } from '@clickhouse/client';
import type { Result, StrictLogger } from '@nangohq/utils';

// TODO: lock to prevent concurrent migrations

export interface ClickhouseMigrateOptions {
    // Called without a database to CREATE DATABASE; returns null when ClickHouse isn't configured.
    clickhouseClient: (opts?: { database: string }) => ClickHouseClient | null;
    database: string;
    // Each database brings its own directory, so migrations never leak across them.
    migrationsDir: string;
    // '.ts' when run from source, '.js' once compiled — the caller derives it from its own module url.
    migrationsExt: string;
    logger: StrictLogger;
}

async function createDatabaseIfNotExists({
    clickhouseClient,
    database
}: Pick<ClickhouseMigrateOptions, 'clickhouseClient' | 'database'>): Promise<Result<void>> {
    const client = clickhouseClient();
    if (!client) {
        return Ok(undefined);
    }
    try {
        await client.command({ query: `CREATE DATABASE IF NOT EXISTS ${database}` });
        return Ok(undefined);
    } catch (err) {
        return Err(`Clickhouse migration (${database}) failed to create the database: ${stringifyError(err)}`);
    } finally {
        await client.close();
    }
}

export async function migrate({ clickhouseClient, database, migrationsDir, migrationsExt, logger }: ClickhouseMigrateOptions): Promise<Result<void>> {
    const create = await createDatabaseIfNotExists({ clickhouseClient, database });
    if (create.isErr()) {
        return create;
    }

    const client = clickhouseClient({ database });
    if (!client) {
        logger.info(`Clickhouse migration (${database}): config not set, skipping migration`);
        return Ok(undefined);
    }
    try {
        const migrationTable = `${database}.migrations`;
        await client.command({
            query: `
                CREATE TABLE IF NOT EXISTS ${migrationTable}
                (
                    name        String,
                    created_at  DateTime64(3) DEFAULT now64()
                )
                ENGINE = ReplacingMergeTree()
                ORDER BY name
            `
        });
        const result = await client.query({ query: `SELECT name FROM ${migrationTable} FINAL`, format: 'JSONEachRow' });
        const rows = await result.json<{ name: string }>();
        const applied = new Set(rows.map((r) => r.name));

        const migrations = (await fs.readdir(migrationsDir)).sort().flatMap((f) => {
            if (f.endsWith(migrationsExt)) {
                const name = path.basename(f);
                return applied.has(name) ? [] : [name];
            }
            return [];
        });

        for (const migration of migrations) {
            const { sql } = (await import(path.join(migrationsDir, migration))) as { sql: string[] };
            logger.info(`Clickhouse migration (${database}): applying ${migration}`);
            for (const statement of sql) {
                await client.command({ query: statement, query_params: { database } });
            }
            await client.insert({ table: migrationTable, values: [{ name: migration }], format: 'JSONEachRow' });
        }
        logger.info(`Clickhouse migration (${database}): ${migrations.length > 0 ? `applied ${migrations.length} migration(s)` : `no migrations`}`);
        return Ok(undefined);
    } catch (err) {
        return Err(`Clickhouse migration (${database}) failed: ${stringifyError(err)}`);
    } finally {
        await client.close();
    }
}
