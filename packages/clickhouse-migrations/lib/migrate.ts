import fs from 'node:fs/promises';
import path from 'node:path';

import { Err, Ok, stringifyError } from '@nangohq/utils';

import type { ClickHouseClient } from '@clickhouse/client';
import type { Result, StrictLogger } from '@nangohq/utils';

function hashToInt(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash % 2147483647;
}

function isProduction(): boolean {
    return process.env['NODE_ENV'] === 'production';
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

async function runWithAdvisoryXactLock<T>({
    knex,
    key,
    timeoutMs,
    logger,
    database,
    fn
}: {
    knex: any;
    key: number;
    timeoutMs: number;
    logger: StrictLogger;
    database: string;
    fn: () => Promise<T>;
}): Promise<T> {
    const start = Date.now();
    let attempt = 0;
    while (Date.now() - start < timeoutMs) {
        attempt++;
        const remaining = timeoutMs - (Date.now() - start);
        if (remaining <= 0) break;
        const queryTimeoutMs = Math.min(5000, remaining);
        let trx: any = null;
        try {
            trx = await knex.transaction();
            const result: any = await withTimeout(
                trx.raw(`SELECT pg_try_advisory_xact_lock(?) as acquired`, [key]),
                queryTimeoutMs,
                `advisory lock query timed out after ${queryTimeoutMs}ms`
            );
            const acquired = result.rows?.[0]?.acquired ?? result[0]?.acquired;
            if (!acquired) {
                await trx.rollback();
                logger.info(`Clickhouse migration (${database}): advisory lock ${key} held by another migration, retrying (attempt ${attempt})`);
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
            }
            logger.info(`Clickhouse migration (${database}): acquired advisory xact lock ${key} (attempt ${attempt})`);
            const fnResult = await fn();
            await trx.commit();
            logger.info(`Clickhouse migration (${database}): released advisory xact lock ${key}`);
            return fnResult;
        } catch (err) {
            if (trx) {
                try {
                    await trx.rollback();
                } catch {}
            }
            const isTimeout = err instanceof Error && err.message.includes('timed out');
            if (isTimeout) {
                logger.warning(`Clickhouse migration (${database}): lock query timed out, retrying`, { error: stringifyError(err) });
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
            }
            throw err;
        }
    }
    throw new Error(`could not acquire advisory xact lock ${key} within ${timeoutMs}ms`);
}

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

    const lockKey = hashToInt(`clickhouse_migration_${database}`);

    const runMigrations = async (): Promise<Result<void>> => {
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
    };

    let knex: any = null;
    try {
        const dbModule = (await import('@nangohq/database')) as any;
        knex = dbModule.default?.knex ?? dbModule.knex ?? null;
    } catch {
        knex = null;
    }

    try {
        if (knex) {
            try {
                return await runWithAdvisoryXactLock({
                    knex,
                    key: lockKey,
                    timeoutMs: 30000,
                    logger,
                    database,
                    fn: runMigrations
                });
            } catch (err) {
                const msg = stringifyError(err);
                if (isProduction()) {
                    return Err(`Clickhouse migration (${database}) failed: ${msg}`);
                }
                logger.warning(`Clickhouse migration (${database}): advisory lock failed, proceeding without lock in non-production`, {
                    error: msg
                });
                return await runMigrations();
            }
        } else {
            if (isProduction()) {
                return Err(`Clickhouse migration (${database}) failed: database not available for advisory lock in production`);
            }
            logger.warning(`Clickhouse migration (${database}): database not available, proceeding without lock`);
            return await runMigrations();
        }
    } catch (err) {
        return Err(`Clickhouse migration (${database}) failed: ${stringifyError(err)}`);
    } finally {
        await client.close();
    }
}
