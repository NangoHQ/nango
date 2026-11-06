import { createPublicKey, sign, verify } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK } from 'jose';
import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrate } from '../db/migrate.js';
import { createCustomer, deleteCustomer, deleteCustomerPreview, getCustomerByName, listCustomers, requireCustomer } from './customer.service.js';
import { createInstallationKey, deleteInstallationKey, getInstallationKey, listInstallationKeys, requireInstallationKey } from './installation-key.service.js';
import { createInstallationLicense, deactivateLicense, getActiveLicense, listLicenses } from './installation-license.service.js';
import {
    createInstallation,
    deleteInstallation,
    deleteInstallationPreview,
    getInstallationByUuid,
    listInstallations,
    requireInstallation,
    updateInstallation
} from './installation.service.js';

import type { RegistryDb } from './db.js';
import type { Knex } from 'knex';

const schema = 'self_hosting_registry_test';

let knex: Knex;
let db: RegistryDb;

async function customer(): Promise<number> {
    return (await createCustomer(db, { name: `customer-${Date.now()}-${Math.random()}` })).unwrap().id;
}

async function installation(): Promise<number> {
    return (await createInstallation(db, { customerId: await customer(), name: 'prod', mode: 'byoc', stage: 'production' })).unwrap().id;
}

const licenseInput = (installationId: number) => ({
    installationId,
    issuedAt: new Date('2026-10-22T13:00:00Z'),
    expiresAt: new Date('2027-10-22T13:00:00Z'),
    graceUntil: new Date('2028-01-22T13:00:00Z'),
    license: '{"version":1}',
    signature: 'sig',
    signingKid: 'nango-1'
});

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    db = { knex, schema };
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    (await migrate({ knex, schema })).unwrap();
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

describe('customers', () => {
    it('creates a customer and finds it by name, but not once deleted', async () => {
        const created = (await createCustomer(db, { name: 'acme' })).unwrap();
        expect(created).toMatchObject({ name: 'acme', deleted_at: null });

        expect((await getCustomerByName(db, { name: 'acme' })).unwrap()).toStrictEqual(created);

        await knex.withSchema(schema).table('customers').where({ id: created.id }).update({ deleted_at: new Date() });
        expect((await getCustomerByName(db, { name: 'acme' })).unwrap()).toBeNull();
    });

    it('returns a duplicate name as an error', async () => {
        await createCustomer(db, { name: 'twice' });
        const res = await createCustomer(db, { name: 'twice' });
        expect(res.isErr() && res.error.message).toBe('customer twice already exists');
    });

    it('requires a live customer by name', async () => {
        const created = (await createCustomer(db, { name: 'required' })).unwrap();
        expect((await requireCustomer(db, { name: 'required' })).unwrap()).toStrictEqual(created);

        (await deleteCustomer(db, { name: 'required' })).unwrap();
        const res = await requireCustomer(db, { name: 'required' });
        expect(res.isErr() && res.error.message).toBe('no live customer required');
    });
});

describe('installations', () => {
    it('creates an installation with the defaults and finds it by uuid', async () => {
        const customerId = await customer();

        const created = (await createInstallation(db, { customerId, name: 'eu-prod', mode: 'self_managed', stage: 'staging' })).unwrap();
        expect(created).toMatchObject({ customer_id: customerId, name: 'eu-prod', mode: 'self_managed', stage: 'staging', telemetry: true, alerts: 'off' });
        expect(created.uuid).toBeUUID();

        expect((await getInstallationByUuid(db, { uuid: created.uuid })).unwrap()).toStrictEqual(created);
    });

    it('stores telemetry and alerts when given', async () => {
        const created = (
            await createInstallation(db, { customerId: await customer(), name: 'dev', mode: 'byoc', stage: 'development', telemetry: false, alerts: 'slack' })
        ).unwrap();
        expect(created).toMatchObject({ telemetry: false, alerts: 'slack' });
    });

    it('returns a duplicate name under the same customer as an error', async () => {
        const customerId = await customer();
        await createInstallation(db, { customerId, name: 'prod', mode: 'byoc', stage: 'production' });
        const res = await createInstallation(db, { customerId, name: 'prod', mode: 'byoc', stage: 'production' });
        expect(res.isErr() && res.error.message).toBe('installation prod already exists for this customer');
    });

    it('refuses alerts on a self-managed installation', async () => {
        const res = await createInstallation(db, { customerId: await customer(), name: 'quiet', mode: 'self_managed', stage: 'production', alerts: 'slack' });
        expect(res.isErr() && res.error.message).toBe('a self-managed installation is not in our Datadog, alerts must be off');
    });

    it('requires a live installation by uuid unless deleted ones are included', async () => {
        const created = (await createInstallation(db, { customerId: await customer(), name: 'required', mode: 'byoc', stage: 'production' })).unwrap();
        expect((await requireInstallation(db, { uuid: created.uuid })).unwrap()).toStrictEqual(created);

        (await deleteInstallation(db, { id: created.id })).unwrap();
        const res = await requireInstallation(db, { uuid: created.uuid });
        expect(res.isErr() && res.error.message).toBe(`no live installation ${created.uuid}`);
        expect((await requireInstallation(db, { uuid: created.uuid, includeDeleted: true })).unwrap().id).toBe(created.id);
        const unknown = await requireInstallation(db, { uuid: '00000000-0000-0000-0000-000000000000', includeDeleted: true });
        expect(unknown.isErr() && unknown.error.message).toBe('no installation 00000000-0000-0000-0000-000000000000');
    });
});

describe('installation keys', () => {
    it('generates an Ed25519 keypair, stores the public half under its thumbprint and returns the private half', async () => {
        const installationId = await installation();

        const { key, privateKeyPem } = (await createInstallationKey(db, { installationId })).unwrap();

        expect(key).toMatchObject({ installation_id: installationId, deleted_at: null });
        expect(key.public_key).toMatch(/^-----BEGIN PUBLIC KEY-----/);
        expect(privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
        expect(key.kid).toBe(await calculateJwkThumbprint(await exportJWK(createPublicKey(key.public_key))));

        const signature = sign(null, Buffer.from('payload'), privateKeyPem);
        expect(verify(null, Buffer.from('payload'), key.public_key, signature)).toBe(true);
    });

    it('lists the live keys of an installation in creation order and drops a deleted one', async () => {
        const installationId = await installation();
        const first = (await createInstallationKey(db, { installationId })).unwrap().key;
        const second = (await createInstallationKey(db, { installationId })).unwrap().key;

        expect((await listInstallationKeys(db, { installationId })).unwrap()).toStrictEqual([first, second]);

        expect((await getInstallationKey(db, { kid: first.kid })).unwrap()).toStrictEqual(first);
        const deleted = (await deleteInstallationKey(db, { kid: first.kid })).unwrap();
        expect(deleted.deleted_at).toBeInstanceOf(Date);
        expect((await getInstallationKey(db, { kid: first.kid })).unwrap()).toBeNull();
        expect((await listInstallationKeys(db, { installationId })).unwrap()).toStrictEqual([second]);
    });

    it('refuses to delete a key that is unknown or already deleted', async () => {
        const installationId = await installation();
        const { key } = (await createInstallationKey(db, { installationId })).unwrap();

        expect((await deleteInstallationKey(db, { kid: 'nope' })).isErr()).toBe(true);
        (await deleteInstallationKey(db, { kid: key.kid })).unwrap();
        expect((await deleteInstallationKey(db, { kid: key.kid })).isErr()).toBe(true);
    });

    it('requires a live key by kid', async () => {
        const { key } = (await createInstallationKey(db, { installationId: await installation() })).unwrap();
        expect((await requireInstallationKey(db, { kid: key.kid })).unwrap()).toStrictEqual(key);

        (await deleteInstallationKey(db, { kid: key.kid })).unwrap();
        const res = await requireInstallationKey(db, { kid: key.kid });
        expect(res.isErr() && res.error.message).toBe(`no live key ${key.kid}`);
    });
});

describe('installation licenses', () => {
    it('creates the active license and returns it as the active one', async () => {
        const installationId = await installation();

        const created = (await createInstallationLicense(db, licenseInput(installationId))).unwrap();

        expect(created).toMatchObject({
            installation_id: installationId,
            issued_at: new Date('2026-10-22T13:00:00Z'),
            expires_at: new Date('2027-10-22T13:00:00Z'),
            grace_until: new Date('2028-01-22T13:00:00Z'),
            license: '{"version":1}',
            signature: 'sig',
            signing_kid: 'nango-1',
            active: true
        });
        expect((await getActiveLicense(db, { installationId })).unwrap()).toStrictEqual(created);
    });

    it('renewing deactivates the previous license and keeps its row', async () => {
        const installationId = await installation();
        const first = (await createInstallationLicense(db, licenseInput(installationId))).unwrap();

        const second = (await createInstallationLicense(db, { ...licenseInput(installationId), signature: 'sig-2' })).unwrap();

        expect((await getActiveLicense(db, { installationId })).unwrap()).toStrictEqual(second);
        const rows = await knex.withSchema(schema).table('installation_licenses').where({ installation_id: installationId }).orderBy('id');
        expect(rows).toMatchObject([
            { id: first.id, active: false },
            { id: second.id, active: true }
        ]);
    });

    it('keeps the previous license active when the new one cannot be inserted', async () => {
        const installationId = await installation();
        const first = (await createInstallationLicense(db, licenseInput(installationId))).unwrap();

        const res = await createInstallationLicense(db, { ...licenseInput(installationId), license: null as unknown as string });

        expect(res.isErr()).toBe(true);
        expect((await getActiveLicense(db, { installationId })).unwrap()).toStrictEqual(first);
    });

    it('deactivates the active license and returns it, then refuses a second time', async () => {
        const installationId = await installation();
        const created = (await createInstallationLicense(db, licenseInput(installationId))).unwrap();

        expect((await deactivateLicense(db, { installationId })).unwrap()).toMatchObject({ id: created.id, active: false });

        expect((await getActiveLicense(db, { installationId })).unwrap()).toBeNull();
        const again = await deactivateLicense(db, { installationId });
        expect(again.isErr() && again.error.message).toBe(`installation ${installationId} has no active license`);
    });
});

describe('customer deletion', () => {
    it('deletes the customer with its live installations, their keys and licenses', async () => {
        const customerId = (await createCustomer(db, { name: 'leaving' })).unwrap().id;
        const installationId = (await createInstallation(db, { customerId, name: 'prod', mode: 'byoc', stage: 'production' })).unwrap().id;
        await createInstallationKey(db, { installationId });
        await createInstallationLicense(db, licenseInput(installationId));

        expect((await deleteCustomer(db, { name: 'leaving' })).unwrap().deleted_at).toBeInstanceOf(Date);

        expect((await getCustomerByName(db, { name: 'leaving' })).unwrap()).toBeNull();
        expect((await listInstallations(db, { customerId })).unwrap()).toStrictEqual([]);
        expect((await listInstallationKeys(db, { installationId })).unwrap()).toStrictEqual([]);
        expect((await getActiveLicense(db, { installationId })).unwrap()).toBeNull();
    });

    it('returns an unknown customer as an error', async () => {
        expect((await deleteCustomer(db, { name: 'nobody' })).isErr()).toBe(true);
    });

    it('previews every live installation that would go with the customer', async () => {
        const created = (await createCustomer(db, { name: 'previewed' })).unwrap();
        const kept = (await createInstallation(db, { customerId: created.id, name: 'kept', mode: 'byoc', stage: 'production' })).unwrap();
        const gone = (await createInstallation(db, { customerId: created.id, name: 'gone', mode: 'byoc', stage: 'staging' })).unwrap();
        const { key } = (await createInstallationKey(db, { installationId: kept.id })).unwrap();
        await createInstallationLicense(db, licenseInput(kept.id));
        (await deleteInstallation(db, { id: gone.id })).unwrap();

        expect((await deleteCustomerPreview(db, { customer: created })).unwrap()).toStrictEqual({
            customer: 'previewed',
            installations: [{ installation: { uuid: kept.uuid, name: 'kept' }, keys: [key.kid], activeLicense: licenseInput(kept.id).expiresAt }]
        });
        expect((await listCustomers(db)).unwrap().map((c) => c.name)).toContain('previewed');
    });
});

describe('installation updates and deletion', () => {
    it('updates only the given fields and bumps updated_at', async () => {
        const created = (await createInstallation(db, { customerId: await customer(), name: 'before', mode: 'byoc', stage: 'production' })).unwrap();
        const lastWeek = new Date('2026-10-29T00:00:00Z');
        await knex.withSchema(schema).table('installations').where({ id: created.id }).update({ updated_at: lastWeek });

        const updated = (await updateInstallation(db, { id: created.id, name: 'after', telemetry: false })).unwrap();

        expect(updated).toMatchObject({ id: created.id, name: 'after', telemetry: false, alerts: 'off', mode: 'byoc', stage: 'production' });
        expect(updated.updated_at.getTime()).toBeGreaterThan(lastWeek.getTime());
    });

    it('refuses a rename to a name the customer already uses', async () => {
        const customerId = await customer();
        await createInstallation(db, { customerId, name: 'taken', mode: 'byoc', stage: 'production' });
        const other = (await createInstallation(db, { customerId, name: 'free', mode: 'byoc', stage: 'production' })).unwrap();

        const res = await updateInstallation(db, { id: other.id, name: 'taken' });
        expect(res.isErr() && res.error.message).toBe('installation taken already exists for this customer');
    });

    it('changes the mode and the stage in place, keeping the uuid', async () => {
        const created = (await createInstallation(db, { customerId: await customer(), name: 'moving', mode: 'byoc', stage: 'production' })).unwrap();

        const updated = (await updateInstallation(db, { id: created.id, mode: 'self_managed', stage: 'staging' })).unwrap();

        expect(updated).toMatchObject({ uuid: created.uuid, name: 'moving', mode: 'self_managed', stage: 'staging' });
    });

    it('lists the live installations of a customer in creation order', async () => {
        const customerId = await customer();
        const first = (await createInstallation(db, { customerId, name: 'a', mode: 'byoc', stage: 'production' })).unwrap();
        const second = (await createInstallation(db, { customerId, name: 'b', mode: 'byoc', stage: 'production' })).unwrap();
        (await deleteInstallation(db, { id: second.id })).unwrap();

        expect((await listInstallations(db, { customerId })).unwrap().map((i) => i.id)).toStrictEqual([first.id]);
    });

    it('deleting an installation deactivates its license, deletes its keys and frees its name', async () => {
        const customerId = await customer();
        const created = (await createInstallation(db, { customerId, name: 'gone', mode: 'byoc', stage: 'production' })).unwrap();
        const { key } = (await createInstallationKey(db, { installationId: created.id })).unwrap();
        await createInstallationLicense(db, licenseInput(created.id));

        const deleted = (await deleteInstallation(db, { id: created.id })).unwrap();

        expect(deleted.deleted_at).toBeInstanceOf(Date);
        expect((await getInstallationByUuid(db, { uuid: created.uuid })).unwrap()).toBeNull();
        expect((await getInstallationByUuid(db, { uuid: created.uuid, includeDeleted: true })).unwrap()?.id).toBe(created.id);
        expect((await getActiveLicense(db, { installationId: created.id })).unwrap()).toBeNull();
        expect((await listInstallationKeys(db, { installationId: created.id })).unwrap()).toStrictEqual([]);
        expect((await deleteInstallationKey(db, { kid: key.kid })).isErr()).toBe(true);
        expect((await createInstallation(db, { customerId, name: 'gone', mode: 'byoc', stage: 'production' })).isOk()).toBe(true);
    });

    it('refuses to update or delete an unknown installation', async () => {
        expect((await updateInstallation(db, { id: 999999, name: 'x' })).isErr()).toBe(true);
        expect((await deleteInstallation(db, { id: 999999 })).isErr()).toBe(true);
    });

    it('refuses an update with nothing to change', async () => {
        const res = await updateInstallation(db, { id: await installation() });
        expect(res.isErr() && res.error.message).toBe('nothing to update');
    });

    it('refuses alerts on a self-managed installation, whichever side of the rule the update moves', async () => {
        const alerting = (
            await createInstallation(db, { customerId: await customer(), name: 'alerting', mode: 'byoc', stage: 'production', alerts: 'slack' })
        ).unwrap();
        const toSelfManaged = await updateInstallation(db, { id: alerting.id, mode: 'self_managed' });
        expect(toSelfManaged.isErr() && toSelfManaged.error.message).toBe('a self-managed installation is not in our Datadog, alerts must be off');

        const quiet = (await createInstallation(db, { customerId: await customer(), name: 'quiet', mode: 'self_managed', stage: 'production' })).unwrap();
        expect((await updateInstallation(db, { id: quiet.id, alerts: 'oncall' })).isErr()).toBe(true);
        expect((await updateInstallation(db, { id: quiet.id, mode: 'byoc', alerts: 'oncall' })).unwrap()).toMatchObject({ mode: 'byoc', alerts: 'oncall' });
        expect((await updateInstallation(db, { id: alerting.id, mode: 'self_managed', alerts: 'off' })).unwrap()).toMatchObject({
            mode: 'self_managed',
            alerts: 'off'
        });
    });

    it('previews the keys and the active license an installation deletion takes down', async () => {
        const created = (await createInstallation(db, { customerId: await customer(), name: 'previewed', mode: 'byoc', stage: 'production' })).unwrap();
        expect((await deleteInstallationPreview(db, { installation: created })).unwrap()).toStrictEqual({
            installation: { uuid: created.uuid, name: 'previewed' },
            keys: [],
            activeLicense: null
        });

        const { key } = (await createInstallationKey(db, { installationId: created.id })).unwrap();
        await createInstallationLicense(db, licenseInput(created.id));
        expect((await deleteInstallationPreview(db, { installation: created })).unwrap()).toMatchObject({
            keys: [key.kid],
            activeLicense: licenseInput(created.id).expiresAt
        });
        expect((await getInstallationByUuid(db, { uuid: created.uuid })).unwrap()).not.toBeNull();
    });
});

describe('lists', () => {
    it('hide deleted rows unless asked, and the license history keeps every row', async () => {
        const kept = (await createCustomer(db, { name: 'kept' })).unwrap();
        const dropped = (await createCustomer(db, { name: 'dropped' })).unwrap();
        const installationId = (await createInstallation(db, { customerId: kept.id, name: 'prod', mode: 'byoc', stage: 'production' })).unwrap().id;
        const { key } = (await createInstallationKey(db, { installationId })).unwrap();
        const first = (await createInstallationLicense(db, licenseInput(installationId))).unwrap();
        const second = (await createInstallationLicense(db, licenseInput(installationId))).unwrap();
        (await deleteInstallationKey(db, { kid: key.kid })).unwrap();
        (await deleteCustomer(db, { name: 'dropped' })).unwrap();

        const names = (rows: { name: string }[]) => rows.map((r) => r.name);
        expect(names((await listCustomers(db)).unwrap())).not.toContain('dropped');
        expect(names((await listCustomers(db, { includeDeleted: true })).unwrap())).toEqual(expect.arrayContaining(['kept', 'dropped']));
        expect((await listInstallationKeys(db, { installationId })).unwrap()).toStrictEqual([]);
        expect((await listInstallationKeys(db, { installationId, includeDeleted: true })).unwrap().map((k) => k.kid)).toStrictEqual([key.kid]);
        expect((await listLicenses(db, { installationId })).unwrap().map((l) => [l.id, l.active])).toStrictEqual([
            [first.id, false],
            [second.id, true]
        ]);
        expect((await listInstallations(db, { customerId: dropped.id })).unwrap()).toStrictEqual([]);
    });

    it('list deleted installations with --all', async () => {
        const customerId = await customer();
        const gone = (await createInstallation(db, { customerId, name: 'gone', mode: 'byoc', stage: 'production' })).unwrap();
        (await deleteInstallation(db, { id: gone.id })).unwrap();

        expect((await listInstallations(db, { customerId })).unwrap()).toStrictEqual([]);
        expect((await listInstallations(db, { customerId, includeDeleted: true })).unwrap().map((i) => i.id)).toStrictEqual([gone.id]);
    });
});
