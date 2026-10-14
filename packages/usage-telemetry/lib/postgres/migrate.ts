import { migrateSchema, migrationsLocation } from '@nangohq/database';

import { USAGE_TELEMETRY_MIGRATIONS_TABLE, USAGE_TELEMETRY_SCHEMA } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export function migrate({ knex, schema = USAGE_TELEMETRY_SCHEMA }: { knex: Knex; schema?: string }): Promise<Result<void>> {
    return migrateSchema({ knex, schema, tableName: USAGE_TELEMETRY_MIGRATIONS_TABLE, ...migrationsLocation(import.meta.url) });
}
