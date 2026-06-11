import crypto from 'node:crypto';

import { CommitmentPolicy, RawAesKeyringNode, RawAesWrappingSuiteIdentifier, buildClient } from '@aws-crypto/client-node';
import { describe, expect, it } from 'vitest';

import { unwrapDek } from './envelope.js';

import type { EncryptionContext, KeyringNode } from '@aws-crypto/client-node';

const { encrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);

const expectedContext = { purpose: 'global_dek', app: 'nango' };
const testDek = crypto.randomBytes(32).toString('base64');

function testKeyring(): RawAesKeyringNode {
    return new RawAesKeyringNode({
        keyName: 'test-key',
        keyNamespace: 'nango-tests',
        unencryptedMasterKey: crypto.randomBytes(32),
        wrappingSuite: RawAesWrappingSuiteIdentifier.AES256_GCM_IV12_TAG16_NO_PADDING
    });
}

async function wrap(keyring: KeyringNode, dek: Uint8Array, encryptionContext: EncryptionContext = expectedContext): Promise<string> {
    const { result } = await encrypt(keyring, dek, { encryptionContext });
    return result.toString('base64');
}

describe('unwrapDek', () => {
    it('should round-trip wrap and unwrap byte-for-byte', async () => {
        const keyring = testKeyring();
        const wrapped = await wrap(keyring, Buffer.from(testDek, 'base64'));
        await expect(unwrapDek({ wrapped, keyring, expectedContext })).resolves.toBe(testDek);
    });

    it('should throw when the wrapped key was bound to a different encryption context', async () => {
        const keyring = testKeyring();
        const wrapped = await wrap(keyring, Buffer.from(testDek, 'base64'), { purpose: 'something_else', app: 'nango' });
        await expect(unwrapDek({ wrapped, keyring, expectedContext })).rejects.toThrow(/Encryption context mismatch/);
    });

    it('should throw when the wrapped key carries unexpected context keys', async () => {
        const keyring = testKeyring();
        const wrapped = await wrap(keyring, Buffer.from(testDek, 'base64'), { ...expectedContext, extra: 'nope' });
        await expect(unwrapDek({ wrapped, keyring, expectedContext })).rejects.toThrow(/Unexpected encryption context key/);
    });

    it('should throw when the envelope decrypts to a non-32-byte key', async () => {
        const keyring = testKeyring();
        const wrapped = await wrap(keyring, crypto.randomBytes(16));
        await expect(unwrapDek({ wrapped, keyring, expectedContext })).rejects.toThrow(/32 bytes/);
    });

    it('should throw when the envelope is tampered with', async () => {
        const keyring = testKeyring();
        const tampered = Buffer.from(await wrap(keyring, Buffer.from(testDek, 'base64')), 'base64');
        tampered[tampered.byteLength - 1] = tampered[tampered.byteLength - 1]! ^ 0xff;
        await expect(unwrapDek({ wrapped: tampered.toString('base64'), keyring, expectedContext })).rejects.toThrow();
    });
});
