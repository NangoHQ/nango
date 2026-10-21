import { migrateSchema, migrationsLocation } from '@nangohq/migrations';

import { REGISTRY_MIGRATIONS_TABLE, REGISTRY_SCHEMA } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

/** Run by the tools that use the registry, never by the server: the schema only exists on Nango cloud. */
export function migrateRegistry({ knex, schema = REGISTRY_SCHEMA }: { knex: Knex; schema?: string }): Promise<Result<void>> {
    return migrateSchema({ knex, schema, tableName: REGISTRY_MIGRATIONS_TABLE, ...migrationsLocation(import.meta.url) });
}
