import { migrateSchema, migrationsLocation } from '@nangohq/migrations';

import { AUDIT_MIGRATIONS_TABLE, AUDIT_SCHEMA } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export function migrate({ knex, schema = AUDIT_SCHEMA }: { knex: Knex; schema?: string }): Promise<Result<void>> {
    return migrateSchema({ knex, schema, tableName: AUDIT_MIGRATIONS_TABLE, ...migrationsLocation(import.meta.url) });
}
