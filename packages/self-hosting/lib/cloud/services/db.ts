import { Err, Ok } from '@nangohq/utils';

import { SELF_HOSTING_SCHEMA } from '../db/schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export interface RegistryDb {
    knex: Knex;
    schema?: string;
}

export function table<T extends object>({ knex, schema = SELF_HOSTING_SCHEMA }: RegistryDb, name: string) {
    return knex.withSchema(schema).table<T>(name);
}

export function inserted<T>(rows: T[]): T {
    const [row] = rows;
    if (!row) {
        throw new Error('insert returned no row');
    }
    return row;
}

export function orMissing<T>(found: Result<T | null>, missing: string): Result<T> {
    if (found.isErr()) {
        return Err(found.error);
    }
    return found.value ? Ok(found.value) : Err(new Error(missing));
}

export function isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}
