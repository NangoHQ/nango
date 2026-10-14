import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Err, Ok } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export interface SchemaMigration {
    name: string;
    up: (knex: Knex, schema: string) => Promise<void>;
}

/** knex's own loader cannot pass the schema through to a migration, and the tests run against their own. */
class SchemaMigrationSource implements Knex.MigrationSource<SchemaMigration> {
    constructor(
        private readonly schema: string,
        private readonly dir: string,
        private readonly ext: string
    ) {}

    async getMigrations(): Promise<SchemaMigration[]> {
        const files = (await fs.readdir(this.dir)).filter((file) => file.endsWith(this.ext)).sort();
        return await Promise.all(
            files.map(async (file) => {
                const module = (await import(pathToFileURL(path.join(this.dir, file)).href)) as Pick<SchemaMigration, 'up'>;
                return { name: path.basename(file, this.ext), up: module.up };
            })
        );
    }

    getMigrationName(migration: SchemaMigration): string {
        return migration.name;
    }

    getMigration(migration: SchemaMigration): Promise<Knex.Migration> {
        return Promise.resolve({
            up: (knex: Knex) => migration.up(knex, this.schema),
            down: () => Promise.resolve()
        });
    }
}

/**
 * Runs a package's own migration set inside its own schema, with knex's tracking table kept in that schema so
 * two sets cannot interfere. Each migration exports `up(knex, schema)`.
 */
export async function migrateSchema({
    knex,
    schema,
    tableName,
    migrationsDir,
    migrationsExt
}: {
    knex: Knex;
    schema: string;
    tableName: string;
    migrationsDir: string;
    migrationsExt: '.ts' | '.js';
}): Promise<Result<void>> {
    try {
        // knex puts its tracking table in this schema, so it has to exist before the set runs.
        await knex.raw('CREATE SCHEMA IF NOT EXISTS ??', [schema]);
        await knex.migrate.latest({
            migrationSource: new SchemaMigrationSource(schema, migrationsDir, migrationsExt),
            schemaName: schema,
            tableName
        });
        return Ok(undefined);
    } catch (err) {
        return Err(new Error(`Failed to migrate schema ${schema}`, { cause: err }));
    }
}

/** The migrations directory and extension next to a package's migrate module, from that module's `import.meta.url`. */
export function migrationsLocation(moduleUrl: string): { migrationsDir: string; migrationsExt: '.ts' | '.js' } {
    return {
        migrationsDir: path.join(path.dirname(fileURLToPath(moduleUrl)), 'migrations'),
        migrationsExt: moduleUrl.endsWith('.ts') ? '.ts' : '.js'
    };
}
