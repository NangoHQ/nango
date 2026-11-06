import { migrateSchema, migrationsLocation } from '@nangohq/migrations';

import { MIGRATIONS_TABLE, SELF_HOSTING_SCHEMA } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

/** Run by the self-hosting service in cloud mode, never on an installation: the schema only exists at Nango. */
export function migrate({ knex, schema = SELF_HOSTING_SCHEMA }: { knex: Knex; schema?: string }): Promise<Result<void>> {
    return migrateSchema({ knex, schema, tableName: MIGRATIONS_TABLE, ...migrationsLocation(import.meta.url) });
}
