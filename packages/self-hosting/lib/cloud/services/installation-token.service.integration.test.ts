import { createPrivateKey, generateKeyPairSync } from 'node:crypto';

import { SignJWT } from 'jose';
import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { digestBody, INSTALLATION_TOKEN_TYPE, mintInstallationToken } from '../../installation/token.js';
import { migrate } from '../db/migrate.js';
import { INSTALLATION_KEYS_TABLE } from '../db/schema.js';
import { createCustomer } from './customer.service.js';
import { createInstallationKey, deleteInstallationKey, getInstallationKey } from './installation-key.service.js';
import { createInstallationLicense, deactivateLicense } from './installation-license.service.js';
import { verifyInstallationToken } from './installation-token.service.js';
import { createInstallation, deleteInstallation, searchInstallations } from './installation.service.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation } from '@nangohq/types';
import type { Knex } from 'knex';

const schema = 'self_hosting_token_test';
const body = Buffer.from('a day of one metric');
const DAY_MS = 86_400_000;

let knex: Knex;
let db: RegistryDb;

async function licensedInstallation(
    name: string,
    { expiresAt = new Date(Date.now() + 365 * DAY_MS), graceUntil = new Date(Date.now() + 455 * DAY_MS) }: { expiresAt?: Date; graceUntil?: Date } = {}
): Promise<{ installation: DBSelfHostingInstallation; kid: string; privateKeyPem: string }> {
    const customer = (await createCustomer(db, { name: `customer-${name}` })).unwrap();
    const installation = (await createInstallation(db, { customerId: customer.id, name, mode: 'byoc', stage: 'production' })).unwrap();
    const { key, privateKeyPem } = (await createInstallationKey(db, { installationId: installation.id })).unwrap();
    (
        await createInstallationLicense(db, {
            installationId: installation.id,
            issuedAt: new Date(),
            expiresAt,
            graceUntil,
            license: 'jws',
            signature: 'sig',
            signingKid: 'nango'
        })
    ).unwrap();
    return { installation, kid: key.kid, privateKeyPem };
}

const mint = (privateKeyPem: string) => mintInstallationToken(privateKeyPem, { body });
const verify = (token: string, registry: RegistryDb = db) => verifyInstallationToken(registry, { token, bodySha256: digestBody(body) });

function code(res: Awaited<ReturnType<typeof verifyInstallationToken>>): string {
    return res.isErr() ? res.error.code : 'ok';
}

function decode(part: string | undefined): Record<string, unknown> {
    return JSON.parse(Buffer.from(part ?? '', 'base64url').toString()) as Record<string, unknown>;
}

/** A token as the installation would mint it, with the header or the claims tampered before signing. */
function forged(kid: string, privateKeyPem: string, { typ = INSTALLATION_TOKEN_TYPE, claims = {} }: { typ?: string; claims?: Record<string, unknown> }) {
    return new SignJWT({ ver: 1, body_sha256: digestBody(body), ...claims })
        .setProtectedHeader({ alg: 'EdDSA', typ, kid })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(createPrivateKey(privateKeyPem));
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

        const token = await mint(privateKeyPem);
        const [header, claims] = token.split('.');
        expect(decode(header)).toStrictEqual({ alg: 'EdDSA', typ: 'nango-installation+jwt', kid });
        const { iat, exp, ...rest } = decode(claims);
        expect(rest).toStrictEqual({ ver: 1, body_sha256: digestBody(body) });
        expect(Number(exp) - Number(iat)).toBe(300);

        expect((await verify(token)).unwrap()).toMatchObject({ id: installation.id, uuid: installation.uuid, name: 'prod' });
        expect((await getInstallationKey(db, { kid })).unwrap()?.last_used_at?.getTime()).toBeGreaterThanOrEqual(before.getTime());
        const [seen] = (await searchInstallations(db, { id: installation.id })).unwrap();
        expect(seen?.last_seen_at?.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('rejects a token presented with another body than the one it was minted for', async () => {
        const { privateKeyPem } = await licensedInstallation('replayed');
        const token = await mint(privateKeyPem);

        const res = await verifyInstallationToken(db, { token, bodySha256: digestBody(Buffer.from('another day')) });
        expect(code(res)).toBe('body_mismatch');
    });

    it('rejects a deleted key', async () => {
        const { kid, privateKeyPem } = await licensedInstallation('deleted-key');
        (await deleteInstallationKey(db, { kid })).unwrap();

        expect(code(await verify(await mint(privateKeyPem)))).toBe('unknown_key');
    });

    it('rejects a key the registry never saw', async () => {
        const { privateKey } = generateKeyPairSync('ed25519');

        expect(code(await verify(await mint(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())))).toBe('unknown_key');
    });

    it('rejects a token signed by another key under a registered key id', async () => {
        const { kid, privateKeyPem } = await licensedInstallation('forged');
        const other = await licensedInstallation('forger');
        const [header, payload] = (await mint(privateKeyPem)).split('.');
        const [, , otherSignature] = (await mint(other.privateKeyPem)).split('.');
        expect(kid).not.toBe(other.kid);

        expect(code(await verify(`${header}.${payload}.${otherSignature}`))).toBe('invalid_signature');
    });

    it('tolerates an installation clock fifteen minutes ahead or twenty behind, and no more', async () => {
        const { privateKeyPem } = await licensedInstallation('skewed');
        const mintedAt = async (offsetMinutes: number) => {
            vi.useFakeTimers({ now: Date.now() + offsetMinutes * 60_000, toFake: ['Date'] });
            try {
                return await mint(privateKeyPem);
            } finally {
                vi.useRealTimers();
            }
        };

        expect(code(await verify(await mintedAt(-19)))).toBe('ok');
        expect(code(await verify(await mintedAt(14)))).toBe('ok');
        const behind = await verify(await mintedAt(-21));
        expect(behind.isErr() && [behind.error.code, behind.error.message]).toStrictEqual([
            'clock_skew',
            "token expired by our clock, check the installation's clock"
        ]);
        const ahead = await verify(await mintedAt(16));
        expect(ahead.isErr() && [ahead.error.code, ahead.error.message]).toStrictEqual([
            'clock_skew',
            "token issued in the future by our clock, check the installation's clock"
        ]);
    });

    it('rejects an installation without an active license', async () => {
        const { installation, privateKeyPem } = await licensedInstallation('revoked');
        (await deactivateLicense(db, { installationId: installation.id })).unwrap();

        expect(code(await verify(await mint(privateKeyPem)))).toBe('no_license');
    });

    it('accepts an expired license inside its grace period and rejects it once the grace period is over', async () => {
        const yesterday = new Date(Date.now() - DAY_MS);
        const inGrace = await licensedInstallation('in-grace', { expiresAt: yesterday, graceUntil: new Date(Date.now() + DAY_MS) });
        const pastGrace = await licensedInstallation('past-grace', { expiresAt: new Date(Date.now() - 2 * DAY_MS), graceUntil: yesterday });

        expect(code(await verify(await mint(inGrace.privateKeyPem)))).toBe('ok');
        expect(code(await verify(await mint(pastGrace.privateKeyPem)))).toBe('license_expired');
    });

    it('rejects a deleted installation, whose keys are deleted with it', async () => {
        const { installation, privateKeyPem } = await licensedInstallation('decommissioned');
        (await deleteInstallation(db, { id: installation.id })).unwrap();

        expect(code(await verify(await mint(privateKeyPem)))).toBe('unknown_key');
    });

    it('reports a registry that cannot be read apart from a bad token, without leaking the database error', async () => {
        const { privateKeyPem } = await licensedInstallation('unreachable');

        const res = await verify(await mint(privateKeyPem), { knex, schema: 'self_hosting_token_test_nowhere' });

        expect(res.isErr() && [res.error.code, res.error.message]).toStrictEqual(['registry_unavailable', 'the registry is unavailable']);
        expect(res.isErr() && res.error.cause).toBeInstanceOf(Error);
    });

    it('still accepts the token when recording its use fails', async () => {
        const { installation, privateKeyPem } = await licensedInstallation('unstamped');
        const token = await mint(privateKeyPem);
        await knex.raw('ALTER TABLE ??.?? RENAME COLUMN last_used_at TO last_used_at_moved', [schema, INSTALLATION_KEYS_TABLE]);
        try {
            expect((await verify(token)).unwrap().id).toBe(installation.id);
        } finally {
            await knex.raw('ALTER TABLE ??.?? RENAME COLUMN last_used_at_moved TO last_used_at', [schema, INSTALLATION_KEYS_TABLE]);
        }
    });

    it('rejects what is not an installation token', async () => {
        const { kid, privateKeyPem } = await licensedInstallation('malformed');
        const withoutIssueTime = await new SignJWT({ ver: 1, body_sha256: digestBody(body) })
            .setProtectedHeader({ alg: 'EdDSA', typ: INSTALLATION_TOKEN_TYPE, kid })
            .setExpirationTime('5m')
            .sign(createPrivateKey(privateKeyPem));

        expect(code(await verify(''))).toBe('malformed');
        expect(code(await verify('a.b.c'))).toBe('malformed');
        expect(code(await verify(`${Buffer.from('{"alg":"EdDSA"}').toString('base64url')}.e30.sig`))).toBe('malformed');
        expect(code(await verify(withoutIssueTime))).toBe('malformed');
        expect(code(await verify(await forged(kid, privateKeyPem, { typ: 'JWT' })))).toBe('malformed');
        expect(code(await verify(await forged(kid, privateKeyPem, { claims: { ver: 2 } })))).toBe('malformed');
        expect(code(await verify(await forged(kid, privateKeyPem, { claims: { body_sha256: undefined } })))).toBe('malformed');
        expect(code(await verify(await forged(kid, privateKeyPem, {})))).toBe('ok');
    });
});
