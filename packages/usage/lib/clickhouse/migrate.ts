import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Err, Ok, stringifyError } from '@nangohq/utils';

import { logger } from '../logger.js';
import { clickhouseClient, database as usageDatabase } from './config.js';

import type { Result } from '@nangohq/utils';

const migrationsDir = path.join(fileURLToPath(import.meta.url), '..', 'migrations');

export async function migrate({ database }: { database: string } = { database: usageDatabase }): Promise<Result<void>> {
    const client = clickhouseClient();
    if (!client) {
        logger.info('Clickhouse migration: config not set, skipping migration');
        return Ok(undefined);
    }

    const migrationTable = `${database}.migrations`;
    try {
        await client.command({ query: `CREATE DATABASE IF NOT EXISTS ${database}` });
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
            if (f.endsWith('.js')) {
                const name = path.basename(f);
                return applied.has(name) ? [] : [name];
            }
            return [];
        });

        for (const migration of migrations) {
            const { sql } = (await import(path.join(migrationsDir, migration))) as { sql: string[] };
            logger.info(`Clickhouse migration: applying ${migration}`);
            for (const statement of sql) {
                await client.command({ query: statement });
            }
            await client.insert({ table: migrationTable, values: [{ name: migration }], format: 'JSONEachRow' });
        }
        logger.info(`Clickhouse migration: ${migrations.length > 0 ? `applied ${migrations.length} migration(s)` : `no migrations`}`);
        return Ok(undefined);
    } catch (err) {
        return Err(`Clickhouse migration failed: ${stringifyError(err)}`);
    } finally {
        await client.close();
    }
}
