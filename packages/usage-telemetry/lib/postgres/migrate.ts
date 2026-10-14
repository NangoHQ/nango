import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Err, getLogger, Ok } from '@nangohq/utils';

import { USAGE_TELEMETRY_MIGRATIONS_TABLE, USAGE_TELEMETRY_SCHEMA } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const logger = getLogger('usage-telemetry');

const migrationsDir = path.join(fileURLToPath(import.meta.url), '..', 'migrations');
const migrationsExt = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

interface UsageTelemetryMigration {
    name: string;
    up: (knex: Knex, schema: string) => Promise<void>;
}

class UsageTelemetryMigrationSource implements Knex.MigrationSource<UsageTelemetryMigration> {
    constructor(private readonly schema: string) {}

    async getMigrations(): Promise<UsageTelemetryMigration[]> {
        const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(migrationsExt)).sort();
        return await Promise.all(
            files.map(async (file) => {
                const module = (await import(pathToFileURL(path.join(migrationsDir, file)).href)) as Pick<UsageTelemetryMigration, 'up'>;
                return { name: path.basename(file, migrationsExt), up: module.up };
            })
        );
    }

    getMigrationName(migration: UsageTelemetryMigration): string {
        return migration.name;
    }

    getMigration(migration: UsageTelemetryMigration): Promise<Knex.Migration> {
        return Promise.resolve({
            up: (knex: Knex) => migration.up(knex, this.schema),
            down: () => Promise.resolve()
        });
    }
}

export async function migrate({ knex, schema = USAGE_TELEMETRY_SCHEMA }: { knex: Knex; schema?: string }): Promise<Result<void>> {
    try {
        await knex.raw('CREATE SCHEMA IF NOT EXISTS ??', [schema]);
        await knex.migrate.latest({
            migrationSource: new UsageTelemetryMigrationSource(schema),
            schemaName: schema,
            tableName: USAGE_TELEMETRY_MIGRATIONS_TABLE
        });
        return Ok(undefined);
    } catch (err) {
        logger.error('usage telemetry postgres migration failed', err);
        return Err(err instanceof Error ? err : new Error(String(err)));
    }
}
