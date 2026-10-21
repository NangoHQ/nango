import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateRegistry } from './migrate.js';
import { CUSTOMERS_TABLE, INSTALLATIONS_TABLE } from './schema.js';

import type { DBSelfHostingInstallation } from '@nangohq/types';
import type { Knex } from 'knex';

const schema = 'self_hosting_test';
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

let knex: Knex;

const customers = () => knex.withSchema(schema).table(CUSTOMERS_TABLE);
const installations = () => knex.withSchema(schema).table<DBSelfHostingInstallation>(INSTALLATIONS_TABLE);

async function createCustomer(): Promise<number> {
    const [row] = await customers()
        .insert({ name: `customer-${Date.now()}-${Math.random()}` })
        .returning<{ id: number }[]>('id');
    if (!row) {
        throw new Error('customer insert returned no row');
    }
    return row.id;
}

const installation = (customerId: number, overrides: Partial<DBSelfHostingInstallation> = {}) => ({
    customer_id: customerId,
    name: 'eu-prod',
    mode: 'byoc' as const,
    ...overrides
});

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    // The main pool's search path: that is where the uuid extension lives once the main migrations have run.
    knex = knexFactory({ client: 'pg', connection: { connectionString: url }, searchPath: [process.env['NANGO_DB_SCHEMA'] ?? 'nango', 'public'] });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    (await migrateRegistry({ knex, schema })).unwrap();
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

describe('self-hosting registry', () => {
    it('is idempotent', async () => {
        expect((await migrateRegistry({ knex, schema })).isOk()).toBe(true);
    });

    it('keeps customer names unique among live customers', async () => {
        await customers().insert({ name: 'monday' });

        await expect(customers().insert({ name: 'monday' })).rejects.toMatchObject({ code: PG_UNIQUE_VIOLATION });

        await customers().where({ name: 'monday' }).update({ deleted_at: new Date() });
        await expect(customers().insert({ name: 'monday' })).resolves.toBeDefined();
    });

    it('fills in the installation id, its public uuid and the timestamps', async () => {
        const customerId = await createCustomer();

        const [row] = await installations().insert(installation(customerId)).returning('*');

        expect(row).toMatchObject({
            customer_id: customerId,
            name: 'eu-prod',
            mode: 'byoc',
            tokens_revoked_before: null,
            disabled_at: null,
            last_seen_at: null
        });
        expect(row?.id).toEqual(expect.any(Number));
        expect(row?.uuid).toBeUUID();
        expect(row?.created_at).toBeInstanceOf(Date);
    });

    it('keeps installation names unique per customer, not across customers', async () => {
        const customerId = await createCustomer();
        const otherCustomerId = await createCustomer();

        await installations().insert(installation(customerId, { name: 'prod' }));

        await expect(installations().insert(installation(customerId, { name: 'prod' }))).rejects.toMatchObject({ code: PG_UNIQUE_VIOLATION });
        await expect(installations().insert(installation(otherCustomerId, { name: 'prod' }))).resolves.toBeDefined();
    });

    it('rejects a mode outside the vocabulary', async () => {
        const customerId = await createCustomer();

        await expect(installations().insert(installation(customerId, { mode: 'cloud' as 'byoc' }))).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
    });

    it('removes the installations of a deleted customer', async () => {
        const customerId = await createCustomer();
        await installations().insert(installation(customerId));

        await customers().where({ id: customerId }).delete();

        expect(await installations().where({ customer_id: customerId }).first()).toBeUndefined();
    });
});
