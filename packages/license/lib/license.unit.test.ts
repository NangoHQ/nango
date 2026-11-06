import { createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK } from 'jose';
import { describe, expect, it } from 'vitest';

import { parseLicense, signLicense, verifyLicense } from './license.js';

import type { LicenseError } from './license.js';
import type { License } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

function keyPair() {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    return {
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKey,
        sign: (data: Buffer) => Promise.resolve(sign('sha256', data, privateKey))
    };
}

function keyIdOf(publicKeyPem: string): Promise<string> {
    return exportJWK(createPublicKey(publicKeyPem)).then(calculateJwkThumbprint);
}

function encode(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function errorCode(res: Result<License, LicenseError>): string {
    return res.isErr() ? res.error.code : 'ok';
}

const license: License = {
    version: 1,
    installation_id: 'f4a2c0e1-7b3d-4e2a-9c1f-0a6d5e8b2c44',
    name: 'acme/prod',
    issued_at: '2026-10-22T13:00:00Z',
    expires_at: '2027-10-22T13:00:00Z',
    grace_until: '2028-01-22T13:00:00Z',
    telemetry: true
};

describe('verifyLicense', () => {
    const key = keyPair();
    const other = keyPair();

    it('accepts a license signed by the trusted key', async () => {
        const envelope = await signLicense(license, key);
        const [header = ''] = envelope.split('.');
        expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toStrictEqual({ alg: 'ES256', kid: await keyIdOf(key.publicKeyPem) });

        expect((await verifyLicense(envelope, key.publicKeyPem)).unwrap()).toStrictEqual(license);
    });

    it('ignores fields the build does not know', async () => {
        const envelope = await signLicense({ ...license, limits: { concurrency: 10 } } as License, key);
        expect((await verifyLicense(envelope, key.publicKeyPem)).unwrap()).toStrictEqual(license);
    });

    it('rejects a tampered payload', async () => {
        const [header, , signature] = (await signLicense(license, key)).split('.');
        const tampered = `${header}.${encode({ ...license, name: 'acme/prod-2' })}.${signature}`;
        expect(errorCode(await verifyLicense(tampered, key.publicKeyPem))).toBe('invalid_signature');
    });

    it('rejects a signature from another key under the trusted key id', async () => {
        const [header, payload] = (await signLicense(license, key)).split('.');
        const forged = Buffer.from(sign('sha256', Buffer.from(`${header}.${payload}`), { key: other.privateKey, dsaEncoding: 'ieee-p1363' })).toString(
            'base64url'
        );
        expect(errorCode(await verifyLicense(`${header}.${payload}.${forged}`, key.publicKeyPem))).toBe('invalid_signature');
    });

    it('refuses a license signed by a key this build does not trust, naming both', async () => {
        const res = await verifyLicense(await signLicense(license, other), key.publicKeyPem);
        expect(errorCode(res)).toBe('unknown_key_id');
        expect(res.isErr() && res.error.message).toBe(
            `license signed by key ${await keyIdOf(other.publicKeyPem)}, this build trusts ${await keyIdOf(key.publicKeyPem)}`
        );
    });

    it('rejects an algorithm other than ES256', async () => {
        const [, payload, signature] = (await signLicense(license, key)).split('.');
        const header = encode({ alg: 'RS256', kid: await keyIdOf(key.publicKeyPem) });
        expect(errorCode(await verifyLicense(`${header}.${payload}.${signature}`, key.publicKeyPem))).toBe('unsupported_algorithm');
    });

    it('rejects a malformed envelope', async () => {
        expect(errorCode(await verifyLicense('', key.publicKeyPem))).toBe('malformed');
        expect(errorCode(await verifyLicense('a.b', key.publicKeyPem))).toBe('malformed');
        expect(errorCode(await verifyLicense('a..c', key.publicKeyPem))).toBe('malformed');
        expect(errorCode(await verifyLicense(`${Buffer.from('not json').toString('base64url')}.b.c`, key.publicKeyPem))).toBe('malformed');
    });

    it('rejects a signed payload that is not a license', async () => {
        const [header] = (await signLicense(license, key)).split('.');
        const payload = encode({ ...license, version: 2 });
        const signature = Buffer.from(sign('sha256', Buffer.from(`${header}.${payload}`), { key: key.privateKey, dsaEncoding: 'ieee-p1363' })).toString(
            'base64url'
        );
        expect(errorCode(await verifyLicense(`${header}.${payload}.${signature}`, key.publicKeyPem))).toBe('invalid_license');
    });
});

describe('signLicense', () => {
    const key = keyPair();

    it('refuses to mint when the signer does not match the public key', async () => {
        const other = keyPair();
        await expect(signLicense(license, { publicKeyPem: key.publicKeyPem, sign: other.sign })).rejects.toMatchObject({
            name: 'LicenseError',
            code: 'invalid_signature'
        });
    });

    it('writes the signature as the 64-byte r || s form', async () => {
        const [header, payload, signature = ''] = (await signLicense(license, key)).split('.');
        const raw = Buffer.from(signature, 'base64url');
        expect(raw).toHaveLength(64);
        expect(verify('sha256', Buffer.from(`${header}.${payload}`), { key: key.publicKeyPem, dsaEncoding: 'ieee-p1363' }, raw)).toBe(true);
    });
});

describe('parseLicense', () => {
    it('requires every field with its type', () => {
        expect(parseLicense(license).unwrap()).toStrictEqual(license);
        expect(errorCode(parseLicense({ ...license, grace_until: undefined }))).toBe('invalid_license');
        expect(errorCode(parseLicense({ ...license, installation_id: 'not-a-uuid' }))).toBe('invalid_license');
        expect(errorCode(parseLicense({ ...license, expires_at: '2027-10-22' }))).toBe('invalid_license');
        expect(errorCode(parseLicense({ ...license, telemetry: 'yes' }))).toBe('invalid_license');
    });
});
