import { migrateSchema, migrationsLocation } from '@nangohq/migrations';

import { HOSTED_TELEMETRY_MIGRATIONS_TABLE, HOSTED_TELEMETRY_SCHEMA } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export function migrate({ knex, schema = HOSTED_TELEMETRY_SCHEMA }: { knex: Knex; schema?: string }): Promise<Result<void>> {
    return migrateSchema({ knex, schema, tableName: HOSTED_TELEMETRY_MIGRATIONS_TABLE, ...migrationsLocation(import.meta.url) });
}
