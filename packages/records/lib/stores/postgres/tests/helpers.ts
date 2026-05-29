import knex from 'knex';

import { config, schema } from '../config.js';

const db = knex(config);

// WARNING: to use only in tests
export async function clearDb(): Promise<void> {
    await db.raw(`DROP SCHEMA ${schema} CASCADE`);
}
