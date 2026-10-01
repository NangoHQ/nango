import crypto from 'node:crypto';

import { AlgorithmSuiteIdentifier, buildClient, CommitmentPolicy, EncryptedDataKey, NodeAlgorithmSuite, NodeDecryptionMaterial } from '@aws-crypto/client-node';
import { describe, expect, it } from 'vitest';

import { AZURE_KMS_PROVIDER_ID, AzureKmsKeyringNode } from './azure.js';
import { unwrapDek } from './envelope.js';

import type { AzureKmsClient } from './azure.js';
import type { EncryptionContext, KeyringNode } from '@aws-crypto/client-node';

const { encrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);

const expectedContext = { purpose: 'global_dek', app: 'nango' };
const testDek = crypto.randomBytes(32).toString('base64');
const testKeyId = 'https://nango-test.vault.azure.net/keys/dek/0123456789abcdef0123456789abcdef';

// Local RSA-OAEP-256, the same algorithm Key Vault runs on wrapKey/unwrapKey.
function stubClient(): AzureKmsClient {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    return {
        wrapKey(_algorithm, key) {
            return Promise.resolve({ result: crypto.publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, key) });
        },
        unwrapKey(_algorithm, encryptedKey) {
            return Promise.resolve({ result: crypto.privateDecrypt({ key: privateKey, oaepHash: 'sha256' }, encryptedKey) });
        }
    };
}

async function wrap(keyring: KeyringNode, dek: Uint8Array, encryptionContext: EncryptionContext = expectedContext): Promise<string> {
    const { result } = await encrypt(keyring, dek, { encryptionContext });
    return result.toString('base64');
}

function emptyMaterial(): NodeDecryptionMaterial {
    return new NodeDecryptionMaterial(
        new NodeAlgorithmSuite(AlgorithmSuiteIdentifier.ALG_AES256_GCM_IV12_TAG16_HKDF_SHA512_COMMIT_KEY_ECDSA_P384),
        expectedContext
    );
}

describe('AzureKmsKeyringNode', () => {
    it('should round-trip wrap and unwrap byte-for-byte', async () => {
        const keyring = new AzureKmsKeyringNode(testKeyId, stubClient());
        const wrapped = await wrap(keyring, Buffer.from(testDek, 'base64'));
        await expect(unwrapDek({ wrapped, keyring, expectedContext })).resolves.toBe(testDek);
    });

    it('should unwrap when the configured key id differs only in casing', async () => {
        const client = stubClient();
        const wrapped = await wrap(new AzureKmsKeyringNode(testKeyId, client), Buffer.from(testDek, 'base64'));
        const keyring = new AzureKmsKeyringNode(testKeyId.replace('nango-test', 'NANGO-TEST').replace('/dek/', '/DEK/'), client);
        await expect(unwrapDek({ wrapped, keyring, expectedContext })).resolves.toBe(testDek);
    });

    it('should throw when the wrapped key was bound to a different encryption context', async () => {
        const keyring = new AzureKmsKeyringNode(testKeyId, stubClient());
        const wrapped = await wrap(keyring, Buffer.from(testDek, 'base64'), { purpose: 'something_else', app: 'nango' });
        await expect(unwrapDek({ wrapped, keyring, expectedContext })).rejects.toThrow(/Encryption context mismatch/);
    });

    it('should fail to unwrap with a different Key Vault key', async () => {
        const wrapped = await wrap(new AzureKmsKeyringNode(testKeyId, stubClient()), Buffer.from(testDek, 'base64'));
        await expect(unwrapDek({ wrapped, keyring: new AzureKmsKeyringNode(testKeyId, stubClient()), expectedContext })).rejects.toThrow();
    });

    it('should reject a key id without a version', () => {
        expect(() => new AzureKmsKeyringNode('https://nango-test.vault.azure.net/keys/dek', stubClient())).toThrow(/must include a version/);
    });

    it('should ignore an EDK with a different providerId rather than throwing', async () => {
        const material = emptyMaterial();
        const result = await new AzureKmsKeyringNode(testKeyId, stubClient())._onDecrypt(material, [
            new EncryptedDataKey({ providerId: 'gcp-kms', providerInfo: testKeyId, encryptedDataKey: crypto.randomBytes(32) })
        ]);
        expect(result).toBe(material);
        expect(result.hasUnencryptedDataKey).toBe(false);
    });

    it('should ignore an EDK with a different providerInfo rather than throwing', async () => {
        const material = emptyMaterial();
        const result = await new AzureKmsKeyringNode(testKeyId, stubClient())._onDecrypt(material, [
            new EncryptedDataKey({
                providerId: AZURE_KMS_PROVIDER_ID,
                providerInfo: 'https://nango-test.vault.azure.net/keys/other/0123456789abcdef0123456789abcdef',
                encryptedDataKey: crypto.randomBytes(32)
            })
        ]);
        expect(result).toBe(material);
        expect(result.hasUnencryptedDataKey).toBe(false);
    });
});
