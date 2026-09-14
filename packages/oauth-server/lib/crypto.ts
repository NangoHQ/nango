import { createHmac, hkdfSync } from 'node:crypto';

import { flattenedDecrypt, FlattenedEncrypt } from 'jose';

import type { FlattenedJWE } from 'jose';

const ENCRYPTION_VERSION = 1;
const KEY_MANAGEMENT_ALGORITHM = 'dir';
const CONTENT_ENCRYPTION_ALGORITHM = 'A256GCM';

export interface ArtifactCrypto {
    hash(value: string): Buffer;
    encrypt(model: string, artifactIdHash: Buffer, value: unknown): Promise<Buffer>;
    decrypt<T>(model: string, artifactIdHash: Buffer, value: Buffer): Promise<T>;
}

export function createArtifactCrypto(encryptionKey: string): ArtifactCrypto {
    const inputKey = Buffer.from(encryptionKey, 'base64');
    if (inputKey.length !== 32) {
        throw new Error('OAuth artifact encryption key must decode to exactly 32 bytes');
    }
    const salt = Buffer.from('nango-oauth-server', 'utf8');
    const payloadEncryptionKey = Buffer.from(hkdfSync('sha256', inputKey, salt, Buffer.from('artifacts:encryption', 'utf8'), 32));
    const lookupKey = Buffer.from(hkdfSync('sha256', inputKey, salt, Buffer.from('artifacts:lookup', 'utf8'), 32));

    return {
        hash(value) {
            return createHmac('sha256', lookupKey).update(value, 'utf8').digest();
        },
        async encrypt(model: string, artifactIdHash: Buffer, value: unknown) {
            const encrypted = await new FlattenedEncrypt(Buffer.from(JSON.stringify(value), 'utf8'))
                .setProtectedHeader({ alg: KEY_MANAGEMENT_ALGORITHM, enc: CONTENT_ENCRYPTION_ALGORITHM, v: ENCRYPTION_VERSION })
                .setAdditionalAuthenticatedData(aad(model, artifactIdHash))
                .encrypt(payloadEncryptionKey);
            return Buffer.from(JSON.stringify(encrypted), 'utf8');
        },
        async decrypt<T>(model: string, artifactIdHash: Buffer, value: Buffer) {
            const encrypted = JSON.parse(value.toString('utf8')) as FlattenedJWE;
            const { plaintext, protectedHeader, additionalAuthenticatedData } = await flattenedDecrypt(encrypted, payloadEncryptionKey, {
                keyManagementAlgorithms: [KEY_MANAGEMENT_ALGORITHM],
                contentEncryptionAlgorithms: [CONTENT_ENCRYPTION_ALGORITHM]
            });
            if (protectedHeader?.['v'] !== ENCRYPTION_VERSION) {
                throw new Error('Unsupported OAuth artifact encryption format');
            }
            if (!additionalAuthenticatedData || !Buffer.from(additionalAuthenticatedData).equals(aad(model, artifactIdHash))) {
                throw new Error('OAuth artifact authenticated context does not match');
            }
            return JSON.parse(Buffer.from(plaintext).toString('utf8')) as T;
        }
    };
}

function aad(model: string, artifactIdHash: Buffer): Buffer {
    return Buffer.from(`${model}\0${artifactIdHash.toString('base64url')}`, 'utf8');
}
