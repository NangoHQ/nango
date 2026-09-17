import crypto from 'node:crypto';

import { AlgorithmSuiteIdentifier, buildClient, CommitmentPolicy, EncryptedDataKey, NodeAlgorithmSuite, NodeDecryptionMaterial } from '@aws-crypto/client-node';
import { describe, expect, it } from 'vitest';

import { unwrapDek } from './envelope.js';
import { GCP_KMS_PROVIDER_ID, GcpKmsKeyringNode } from './gcp.js';

import type { GcpKmsClient } from './gcp.js';
import type { EncryptionContext, KeyringNode } from '@aws-crypto/client-node';

const { encrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);

const expectedContext = { purpose: 'global_dek', app: 'nango' };
const testDek = crypto.randomBytes(32).toString('base64');
const testKeyName = 'projects/test/locations/global/keyRings/nango/cryptoKeys/dek';

function canonicalAad(context: Readonly<Record<string, string>>): Buffer {
    return Buffer.from(JSON.stringify(context, Object.keys(context).sort()));
}

function stubClient(onEncrypt?: (aad: Uint8Array) => void): GcpKmsClient {
    const store = new Map<string, { plaintext: Buffer; aad: Buffer }>();
    let seq = 0;
    return {
        encrypt(request) {
            onEncrypt?.(request.additionalAuthenticatedData);
            const ciphertext = Buffer.from(`gcp-cipher-${seq++}`);
            store.set(ciphertext.toString('hex'), {
                plaintext: Buffer.from(request.plaintext),
                aad: Buffer.from(request.additionalAuthenticatedData)
            });
            return Promise.resolve([{ ciphertext }]);
        },
        decrypt(request) {
            const stored = store.get(Buffer.from(request.ciphertext).toString('hex'));
            if (!stored) {
                throw new Error('unknown ciphertext');
            }
            if (!stored.aad.equals(Buffer.from(request.additionalAuthenticatedData))) {
                throw new Error('AAD mismatch');
            }
            return Promise.resolve([{ plaintext: stored.plaintext }]);
        }
    };
}

function testKeyring(client: GcpKmsClient = stubClient(), keyName = testKeyName): GcpKmsKeyringNode {
    return new GcpKmsKeyringNode(keyName, client);
}

async function wrap(keyring: KeyringNode, dek: Uint8Array, encryptionContext: EncryptionContext = expectedContext): Promise<string> {
    const { result } = await encrypt(keyring, dek, { encryptionContext });
    return result.toString('base64');
}

describe('GcpKmsKeyringNode', () => {
    it('should round-trip wrap and unwrap byte-for-byte', async () => {
        const client = stubClient();
        const keyring = testKeyring(client);
        const wrapped = await wrap(keyring, Buffer.from(testDek, 'base64'));
        await expect(unwrapDek({ wrapped, keyring, expectedContext })).resolves.toBe(testDek);
    });

    it('should bind the canonical AAD serialization into the GCP encrypt call', async () => {
        const seen: Uint8Array[] = [];
        const keyring = testKeyring(stubClient((aad) => seen.push(aad)));
        await wrap(keyring, Buffer.from(testDek, 'base64'));
        expect(seen).toHaveLength(1);
        const aad = seen[0];
        if (aad === undefined) {
            throw new Error('expected AAD to be captured');
        }
        const parsed = JSON.parse(Buffer.from(aad).toString()) as Record<string, string>;
        expect(parsed['purpose']).toBe('global_dek');
        expect(parsed['app']).toBe('nango');
        // The Encryption SDK may add its own context keys; the wire format is still sorted-key JSON.
        expect(Buffer.from(aad).equals(canonicalAad(parsed))).toBe(true);
    });

    it('should throw when the wrapped key was bound to a different encryption context', async () => {
        const keyring = testKeyring();
        const wrapped = await wrap(keyring, Buffer.from(testDek, 'base64'), { purpose: 'something_else', app: 'nango' });
        await expect(unwrapDek({ wrapped, keyring, expectedContext })).rejects.toThrow(/Encryption context mismatch/);
    });

    it('should ignore an EDK with a different providerId rather than throwing', async () => {
        const keyring = testKeyring();
        const material = new NodeDecryptionMaterial(
            new NodeAlgorithmSuite(AlgorithmSuiteIdentifier.ALG_AES256_GCM_IV12_TAG16_HKDF_SHA512_COMMIT_KEY_ECDSA_P384),
            expectedContext
        );
        const result = await keyring._onDecrypt(material, [
            new EncryptedDataKey({
                providerId: 'aws-kms',
                providerInfo: testKeyName,
                encryptedDataKey: crypto.randomBytes(32)
            })
        ]);
        expect(result).toBe(material);
        expect(result.hasUnencryptedDataKey).toBe(false);
    });

    it('should ignore an EDK with a different providerInfo rather than throwing', async () => {
        const keyring = testKeyring();
        const material = new NodeDecryptionMaterial(
            new NodeAlgorithmSuite(AlgorithmSuiteIdentifier.ALG_AES256_GCM_IV12_TAG16_HKDF_SHA512_COMMIT_KEY_ECDSA_P384),
            expectedContext
        );
        const result = await keyring._onDecrypt(material, [
            new EncryptedDataKey({
                providerId: GCP_KMS_PROVIDER_ID,
                providerInfo: 'projects/other/locations/global/keyRings/nango/cryptoKeys/other',
                encryptedDataKey: crypto.randomBytes(32)
            })
        ]);
        expect(result).toBe(material);
        expect(result.hasUnencryptedDataKey).toBe(false);
    });
});
