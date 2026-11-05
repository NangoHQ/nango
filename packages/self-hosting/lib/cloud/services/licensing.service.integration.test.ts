import { generateKeyPairSync, sign } from 'node:crypto';

import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyLicense } from '@nangohq/license';

import { migrate } from '../db/migrate.js';
import { getCustomerByName } from './customer.service.js';
import { listInstallationKeys } from './installation-key.service.js';
import { getActiveLicense } from './installation-license.service.js';
import { disableInstallation, onboardInstallation, renewLicense, rotateInstallationKey } from './licensing.service.js';

import type { LicenseSigner } from '../licensing/signer.js';
import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation, DBSelfHostingInstallationLicense } from '@nangohq/types';
import type { Knex } from 'knex';

const schema = 'self_hosting_licensing_test';

let knex: Knex;
let db: RegistryDb;

function localSigner(): LicenseSigner {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    return {
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        sign: (data) => Promise.resolve(sign('sha256', data, privateKey))
    };
}

const signer = localSigner();
const expiresAt = new Date('2027-11-05T00:00:00Z');
const graceUntil = new Date('2028-02-03T00:00:00Z');

function onboard(name: string, overrides: Partial<Parameters<typeof onboardInstallation>[1]> = {}) {
    return onboardInstallation(db, { customer: 'acme', name, mode: 'byoc', stage: 'production', expiresAt, graceUntil, signer, ...overrides });
}

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

describe('onboardInstallation', () => {
    it('creates the customer, the installation, one key and a license that verifies and names the installation', async () => {
        const { installation, key, envelope } = (await onboard('prod', { telemetry: false, alerts: 'slack' })).unwrap();

        expect(installation).toMatchObject({ name: 'prod', mode: 'byoc', stage: 'production', telemetry: false, alerts: 'slack' });
        expect((await getCustomerByName(db, { name: 'acme' })).unwrap()?.id).toBe(installation.customer_id);
        expect((await listInstallationKeys(db, { installationId: installation.id })).unwrap().map((k) => k.kid)).toStrictEqual([key.kid]);
        expect(key.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);

        const license = (await verifyLicense(envelope, signer.publicKeyPem)).unwrap();
        expect(license).toMatchObject({
            version: 1,
            installation_id: installation.uuid,
            name: 'prod',
            expires_at: expiresAt.toISOString(),
            grace_until: graceUntil.toISOString(),
            telemetry: false
        });

        const active = (await getActiveLicense(db, { installationId: installation.id })).unwrap();
        expect(active).toMatchObject({ license: envelope, signature: envelope.split('.')[2], expires_at: expiresAt, grace_until: graceUntil, active: true });
        expect(active?.signing_kid).toBe((JSON.parse(Buffer.from(envelope.split('.')[0] ?? '', 'base64url').toString()) as { kid: string }).kid);
    });

    it('reuses an existing customer', async () => {
        const first = (await onboard('staging')).unwrap();
        const second = (await onboard('dev')).unwrap();
        expect(second.installation.customer_id).toBe(first.installation.customer_id);
    });

    it('writes nothing when signing fails', async () => {
        const res = await onboard('broken', { signer: { ...signer, sign: () => Promise.reject(new Error('kms down')) } });

        expect(res.isErr() && res.error.message).toBe('kms down');
        expect(await knex.withSchema(schema).table<DBSelfHostingInstallation>('installations').where({ name: 'broken' }).first()).toBeUndefined();
    });

    it('returns a duplicate installation name as an error', async () => {
        (await onboard('twice')).unwrap();
        expect((await onboard('twice')).isErr()).toBe(true);
    });
});

describe('renewLicense', () => {
    it('issues a new active license and keeps the previous one inactive', async () => {
        const { installation, envelope: first } = (await onboard('renew')).unwrap();
        const later = new Date('2028-11-05T00:00:00Z');

        const { envelope } = (
            await renewLicense(db, { installationUuid: installation.uuid, expiresAt: later, graceUntil: new Date('2029-02-03T00:00:00Z'), signer })
        ).unwrap();

        expect(envelope).not.toBe(first);
        expect((await verifyLicense(envelope, signer.publicKeyPem)).unwrap().expires_at).toBe(later.toISOString());
        const rows = await knex
            .withSchema(schema)
            .table<DBSelfHostingInstallationLicense>('installation_licenses')
            .where({ installation_id: installation.id })
            .orderBy('id');
        expect(rows.map((r: DBSelfHostingInstallationLicense) => r.active)).toStrictEqual([false, true]);
    });

    it('refuses an unknown installation', async () => {
        const res = await renewLicense(db, { installationUuid: '00000000-0000-4000-8000-000000000000', expiresAt, graceUntil, signer });
        expect(res.isErr() && res.error.message).toBe('no live installation 00000000-0000-4000-8000-000000000000');
    });
});

describe('rotateInstallationKey', () => {
    it('adds a second live key under the same installation', async () => {
        const { installation, key } = (await onboard('rotate')).unwrap();

        const rotated = (await rotateInstallationKey(db, { installationUuid: installation.uuid })).unwrap();

        expect(rotated.kid).not.toBe(key.kid);
        expect((await listInstallationKeys(db, { installationId: installation.id })).unwrap().map((k) => k.kid)).toStrictEqual([key.kid, rotated.kid]);
    });
});

describe('disableInstallation', () => {
    it('leaves the installation without an active license', async () => {
        const { installation } = (await onboard('disable')).unwrap();

        (await disableInstallation(db, { installationUuid: installation.uuid })).unwrap();

        expect((await getActiveLicense(db, { installationId: installation.id })).unwrap()).toBeNull();
    });
});
