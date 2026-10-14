import path from 'node:path';
import { fileURLToPath } from 'node:url';

import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateSchema, migrationsLocation } from './schemaMigrations.js';

import type { Knex } from 'knex';

const schema = 'schema_migrations_test';
const tableName = 'migrations';
const location = migrationsLocation(new URL('./testing/migrate.ts', import.meta.url).href);

let knex: Knex;

async function applied(): Promise<string[]> {
    const { rows } = await knex.raw<{ rows: { name: string }[] }>(`SELECT name FROM ??.?? ORDER BY name`, [schema, tableName]);
    return rows.map((r) => r.name);
}

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

describe('migrateSchema', () => {
    it('resolves the migrations directory next to the calling module, with its extension', () => {
        expect(location).toEqual({ migrationsDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'testing', 'migrations'), migrationsExt: '.ts' });
    });

    it('creates the schema, keeps the tracking table inside it and applies only this set', async () => {
        expect((await migrateSchema({ knex, schema, tableName, ...location })).isOk()).toBe(true);
        expect(await applied()).toEqual(['20260101000001_create_items']);
        await expect(knex.withSchema(schema).table('items').insert({ id: 1 })).resolves.toBeDefined();
    });

    it('is idempotent, so a restart re-running it is a no-op', async () => {
        expect((await migrateSchema({ knex, schema, tableName, ...location })).isOk()).toBe(true);
        expect(await applied()).toEqual(['20260101000001_create_items']);
    });

    it('can re-create everything after its migration record is gone, as after a rollback', async () => {
        await knex.raw(`DELETE FROM ??.??`, [schema, tableName]);
        expect((await migrateSchema({ knex, schema, tableName, ...location })).isOk()).toBe(true);
        expect(await applied()).toEqual(['20260101000001_create_items']);
    });

    it('returns the failure instead of throwing when a migration cannot run', async () => {
        const res = await migrateSchema({ knex, schema, tableName, migrationsDir: '/does/not/exist', migrationsExt: '.ts' });
        expect(res.isErr()).toBe(true);
    });
});
