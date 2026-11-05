import { generateKeyPairSync, sign } from 'node:crypto';

import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyLicense } from '@nangohq/license';

import { migrate } from '../db/migrate.js';
import { createCustomer } from './customer.service.js';
import { getActiveLicense } from './installation-license.service.js';
import { createInstallation } from './installation.service.js';
import { issueLicense } from './licensing.service.js';

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

async function installation(name: string, telemetry = true): Promise<DBSelfHostingInstallation> {
    const customer = (await createCustomer(db, { name: `customer-${name}` })).unwrap();
    return (await createInstallation(db, { customerId: customer.id, name, mode: 'byoc', stage: 'production', telemetry })).unwrap();
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

describe('issueLicense', () => {
    it('signs the installation as it is in the registry and stores the envelope as the active license', async () => {
        const row = await installation('prod', false);

        const { envelope, license } = (await issueLicense(db, { installation: row, signer, expiresAt, graceUntil })).unwrap();

        expect((await verifyLicense(envelope, signer.publicKeyPem)).unwrap()).toMatchObject({
            version: 1,
            installation_id: row.uuid,
            name: 'prod',
            expires_at: expiresAt.toISOString(),
            grace_until: graceUntil.toISOString(),
            telemetry: false
        });
        expect(license).toMatchObject({
            installation_id: row.id,
            license: envelope,
            signature: envelope.split('.')[2],
            expires_at: expiresAt,
            grace_until: graceUntil,
            active: true
        });
        expect(license.signing_kid).toBe((JSON.parse(Buffer.from(envelope.split('.')[0] ?? '', 'base64url').toString()) as { kid: string }).kid);
        expect((await getActiveLicense(db, { installationId: row.id })).unwrap()).toStrictEqual(license);
    });

    it('issued again, replaces the active license and keeps the previous row inactive', async () => {
        const row = await installation('renew');
        const { envelope: first } = (await issueLicense(db, { installation: row, signer, expiresAt, graceUntil })).unwrap();
        const later = new Date('2028-11-05T00:00:00Z');

        const { envelope } = (await issueLicense(db, { installation: row, signer, expiresAt: later, graceUntil: new Date('2029-02-03T00:00:00Z') })).unwrap();

        expect(envelope).not.toBe(first);
        expect((await verifyLicense(envelope, signer.publicKeyPem)).unwrap().expires_at).toBe(later.toISOString());
        const rows = await knex
            .withSchema(schema)
            .table<DBSelfHostingInstallationLicense>('installation_licenses')
            .where({ installation_id: row.id })
            .orderBy('id');
        expect(rows.map((r: DBSelfHostingInstallationLicense) => r.active)).toStrictEqual([false, true]);
    });

    it('stores nothing when signing fails', async () => {
        const row = await installation('broken');

        const res = await issueLicense(db, {
            installation: row,
            signer: { ...signer, sign: () => Promise.reject(new Error('kms down')) },
            expiresAt,
            graceUntil
        });

        expect(res.isErr() && res.error.message).toBe('kms down');
        expect((await getActiveLicense(db, { installationId: row.id })).unwrap()).toBeNull();
    });
});
