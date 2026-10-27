import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateRegistry } from './migrate.js';
import { CUSTOMERS_TABLE, INSTALLATION_KEYS_TABLE, INSTALLATION_LICENSES_TABLE, INSTALLATIONS_TABLE } from './schema.js';

import type { DBSelfHostingInstallation, DBSelfHostingInstallationKey, DBSelfHostingInstallationLicense } from '@nangohq/types';
import type { Knex } from 'knex';

const schema = 'self_hosting_test';
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

let knex: Knex;

const customers = () => knex.withSchema(schema).table(CUSTOMERS_TABLE);
const installations = () => knex.withSchema(schema).table<DBSelfHostingInstallation>(INSTALLATIONS_TABLE);
const keys = () => knex.withSchema(schema).table<DBSelfHostingInstallationKey>(INSTALLATION_KEYS_TABLE);
const licenses = () => knex.withSchema(schema).table<DBSelfHostingInstallationLicense>(INSTALLATION_LICENSES_TABLE);

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
    stage: 'production' as const,
    ...overrides
});

async function createInstallation(customerId: number, overrides: Partial<DBSelfHostingInstallation> = {}): Promise<number> {
    const [row] = await installations().insert(installation(customerId, overrides)).returning('id');
    if (!row) {
        throw new Error('installation insert returned no row');
    }
    return row.id;
}

const license = (installationId: number, overrides: Partial<DBSelfHostingInstallationLicense> = {}) => ({
    installation_id: installationId,
    issued_at: new Date('2026-10-22T13:00:00Z'),
    expires_at: new Date('2027-10-22T13:00:00Z'),
    grace_until: new Date('2028-01-22T13:00:00Z'),
    license: '{"version":1}',
    signature: 'sig',
    signing_kid: 'nango-1',
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

    it('fills in the installation id, its public uuid, the defaults and the timestamps', async () => {
        const customerId = await createCustomer();

        const [row] = await installations().insert(installation(customerId)).returning('*');

        expect(row).toMatchObject({
            customer_id: customerId,
            name: 'eu-prod',
            mode: 'byoc',
            stage: 'production',
            telemetry: true,
            alerts: 'off',
            disabled_at: null,
            deleted_at: null,
            last_seen_at: null
        });
        expect(row?.id).toEqual(expect.any(Number));
        expect(row?.uuid).toBeUUID();
        expect(row?.created_at).toBeInstanceOf(Date);
        expect(row?.updated_at).toBeInstanceOf(Date);
    });

    it('keeps installation names unique per live customer, not across customers', async () => {
        const customerId = await createCustomer();
        const otherCustomerId = await createCustomer();

        await installations().insert(installation(customerId, { name: 'prod' }));

        await expect(installations().insert(installation(customerId, { name: 'prod' }))).rejects.toMatchObject({ code: PG_UNIQUE_VIOLATION });
        await expect(installations().insert(installation(otherCustomerId, { name: 'prod' }))).resolves.toBeDefined();

        await installations().where({ customer_id: customerId, name: 'prod' }).update({ deleted_at: new Date() });
        await expect(installations().insert(installation(customerId, { name: 'prod' }))).resolves.toBeDefined();
    });

    it('rejects a mode, stage or alerts value outside the vocabulary', async () => {
        const customerId = await createCustomer();

        await expect(installations().insert(installation(customerId, { mode: 'cloud' as 'byoc' }))).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
        await expect(installations().insert(installation(customerId, { stage: 'prod' as 'production' }))).rejects.toMatchObject({
            code: PG_CHECK_VIOLATION
        });
        await expect(installations().insert(installation(customerId, { alerts: 'pager' as 'oncall' }))).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
    });

    it('keeps key ids unique across installations', async () => {
        const customerId = await createCustomer();
        const installationId = await createInstallation(customerId, { name: 'a' });
        const otherInstallationId = await createInstallation(customerId, { name: 'b' });

        await keys().insert({ installation_id: installationId, kid: 'k1', public_key: 'pem' });

        await expect(keys().insert({ installation_id: otherInstallationId, kid: 'k1', public_key: 'pem' })).rejects.toMatchObject({
            code: PG_UNIQUE_VIOLATION
        });
    });

    it('allows one active license per installation', async () => {
        const customerId = await createCustomer();
        const installationId = await createInstallation(customerId);

        const [first] = await licenses().insert(license(installationId)).returning('*');
        if (!first) {
            throw new Error('license insert returned no row');
        }
        expect(first).toMatchObject({ installation_id: installationId, active: true, signing_kid: 'nango-1' });

        await expect(licenses().insert(license(installationId))).rejects.toMatchObject({ code: PG_UNIQUE_VIOLATION });

        await licenses().where({ id: first.id }).update({ active: false });
        await expect(licenses().insert(license(installationId))).resolves.toBeDefined();
    });

    it('removes the installations, keys and licenses of a deleted customer', async () => {
        const customerId = await createCustomer();
        const installationId = await createInstallation(customerId);
        await keys().insert({ installation_id: installationId, kid: `k-${installationId}`, public_key: 'pem' });
        await licenses().insert(license(installationId));

        await customers().where({ id: customerId }).delete();

        expect(await installations().where({ customer_id: customerId }).first()).toBeUndefined();
        expect(await keys().where({ installation_id: installationId }).first()).toBeUndefined();
        expect(await licenses().where({ installation_id: installationId }).first()).toBeUndefined();
    });
});
