import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Err, getLogger, Ok } from '@nangohq/utils';

import { AUDIT_MIGRATIONS_TABLE, AUDIT_SCHEMA } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const logger = getLogger('audit');

const migrationsDir = path.join(fileURLToPath(import.meta.url), '..', 'migrations');
const migrationsExt = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

interface AuditMigration {
    name: string;
    up: (knex: Knex, schema: string) => Promise<void>;
}

/** knex's own loader cannot pass the schema through to a migration, and the tests run against their own. */
class AuditMigrationSource implements Knex.MigrationSource<AuditMigration> {
    constructor(private readonly schema: string) {}

    async getMigrations(): Promise<AuditMigration[]> {
        const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(migrationsExt)).sort();
        return await Promise.all(
            files.map(async (file) => {
                const module = (await import(pathToFileURL(path.join(migrationsDir, file)).href)) as Pick<AuditMigration, 'up'>;
                return { name: path.basename(file, migrationsExt), up: module.up };
            })
        );
    }

    getMigrationName(migration: AuditMigration): string {
        return migration.name;
    }

    getMigration(migration: AuditMigration): Promise<Knex.Migration> {
        return Promise.resolve({
            up: (knex: Knex) => migration.up(knex, this.schema),
            down: () => Promise.resolve()
        });
    }
}

export async function migrate({ knex, schema = AUDIT_SCHEMA }: { knex: Knex; schema?: string }): Promise<Result<void>> {
    try {
        // knex puts its tracking table in this schema, so it has to exist before the set runs.
        await knex.raw('CREATE SCHEMA IF NOT EXISTS ??', [schema]);
        await knex.migrate.latest({
            migrationSource: new AuditMigrationSource(schema),
            schemaName: schema,
            tableName: AUDIT_MIGRATIONS_TABLE
        });
        return Ok(undefined);
    } catch (err) {
        logger.error('audit postgres migration failed', err);
        return Err(err instanceof Error ? err : new Error(String(err)));
    }
}
