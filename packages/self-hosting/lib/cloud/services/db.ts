import { SELF_HOSTING_SCHEMA } from '../db/schema.js';

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
