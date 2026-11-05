import { generateKeyPairSync } from 'node:crypto';

import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mintInstallationToken } from '../../installation/token.js';
import { migrate } from '../db/migrate.js';
import { createCustomer } from './customer.service.js';
import { createInstallationKey, deleteInstallationKey, getInstallationKey } from './installation-key.service.js';
import { createInstallationLicense, deactivateLicense } from './installation-license.service.js';
import { verifyInstallationToken } from './installation-token.service.js';
import { createInstallation, deleteInstallation, getInstallation } from './installation.service.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation } from '@nangohq/types';
import type { Knex } from 'knex';

const schema = 'self_hosting_token_test';

let knex: Knex;
let db: RegistryDb;

async function licensedInstallation(name: string): Promise<{ installation: DBSelfHostingInstallation; kid: string; privateKeyPem: string }> {
    const customer = (await createCustomer(db, { name: `customer-${name}` })).unwrap();
    const installation = (await createInstallation(db, { customerId: customer.id, name, mode: 'byoc', stage: 'production' })).unwrap();
    const { key, privateKeyPem } = (await createInstallationKey(db, { installationId: installation.id })).unwrap();
    (
        await createInstallationLicense(db, {
            installationId: installation.id,
            issuedAt: new Date(),
            expiresAt: new Date('2027-11-05T00:00:00Z'),
            graceUntil: new Date('2028-02-03T00:00:00Z'),
            license: 'jws',
            signature: 'sig',
            signingKid: 'nango'
        })
    ).unwrap();
    return { installation, kid: key.kid, privateKeyPem };
}

function code(res: Awaited<ReturnType<typeof verifyInstallationToken>>): string {
    return res.isErr() ? res.error.code : 'ok';
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

describe('installation tokens', () => {
    it('a token minted with a live key resolves to its installation and stamps the use', async () => {
        const { installation, kid, privateKeyPem } = await licensedInstallation('prod');
        const before = new Date();

        const token = await mintInstallationToken(privateKeyPem);
        const [header = ''] = token.split('.');
        expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toStrictEqual({ alg: 'EdDSA', kid });

        const res = await verifyInstallationToken(db, token);
        expect(res.unwrap()).toMatchObject({ id: installation.id, uuid: installation.uuid, name: 'prod' });
        expect((await getInstallationKey(db, { kid })).unwrap()?.last_used_at?.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect((await getInstallation(db, { id: installation.id })).unwrap()?.last_seen_at?.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('rejects a deleted key', async () => {
        const { kid, privateKeyPem } = await licensedInstallation('deleted-key');
        (await deleteInstallationKey(db, { kid })).unwrap();

        const res = await verifyInstallationToken(db, await mintInstallationToken(privateKeyPem));
        expect(code(res)).toBe('unknown_key');
    });

    it('rejects a key the registry never saw', async () => {
        const { privateKey } = generateKeyPairSync('ed25519');
        const token = await mintInstallationToken(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());

        expect(code(await verifyInstallationToken(db, token))).toBe('unknown_key');
    });

    it('rejects a token signed by another key under a registered key id', async () => {
        const { kid, privateKeyPem } = await licensedInstallation('forged');
        const other = await licensedInstallation('forger');
        const [header, payload] = (await mintInstallationToken(privateKeyPem)).split('.');
        const [, , otherSignature] = (await mintInstallationToken(other.privateKeyPem)).split('.');
        expect(kid).not.toBe(other.kid);

        const res = await verifyInstallationToken(db, `${header}.${payload}.${otherSignature}`);
        expect(code(res)).toBe('invalid_signature');
    });

    it('rejects an expired token', async () => {
        const { privateKeyPem } = await licensedInstallation('expired');

        const res = await verifyInstallationToken(db, await mintInstallationToken(privateKeyPem, { ttlSeconds: -10 }));
        expect(code(res)).toBe('expired');
    });

    it('rejects an installation without an active license', async () => {
        const { installation, privateKeyPem } = await licensedInstallation('revoked');
        (await deactivateLicense(db, { installationId: installation.id })).unwrap();

        const res = await verifyInstallationToken(db, await mintInstallationToken(privateKeyPem));
        expect(code(res)).toBe('no_license');
    });

    it('rejects a deleted installation, whose keys are deleted with it', async () => {
        const { installation, privateKeyPem } = await licensedInstallation('decommissioned');
        (await deleteInstallation(db, { id: installation.id })).unwrap();

        const res = await verifyInstallationToken(db, await mintInstallationToken(privateKeyPem));
        expect(code(res)).toBe('unknown_key');
    });

    it('rejects what is not a token', async () => {
        expect(code(await verifyInstallationToken(db, ''))).toBe('malformed');
        expect(code(await verifyInstallationToken(db, 'a.b.c'))).toBe('malformed');
        expect(code(await verifyInstallationToken(db, `${Buffer.from('{"alg":"EdDSA"}').toString('base64url')}.e30.sig`))).toBe('malformed');
    });
});
