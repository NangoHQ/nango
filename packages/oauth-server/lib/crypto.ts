import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const ENCRYPTION_VERSION = 1;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface ArtifactCrypto {
    hash(value: string): Buffer;
    encrypt(model: string, artifactIdHash: Buffer, value: unknown): Buffer;
    decrypt<T>(model: string, artifactIdHash: Buffer, value: Buffer): T;
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
        encrypt(model: string, artifactIdHash: Buffer, value: unknown) {
            const iv = randomBytes(IV_LENGTH);
            const cipher = createCipheriv('aes-256-gcm', payloadEncryptionKey, iv);
            cipher.setAAD(aad(model, artifactIdHash));
            const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
            return Buffer.concat([Buffer.from([ENCRYPTION_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
        },
        decrypt<T>(model: string, artifactIdHash: Buffer, value: Buffer) {
            if (value.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH || value[0] !== ENCRYPTION_VERSION) {
                throw new Error('Unsupported OAuth artifact encryption format');
            }

            const ivStart = 1;
            const tagStart = ivStart + IV_LENGTH;
            const ciphertextStart = tagStart + AUTH_TAG_LENGTH;
            const decipher = createDecipheriv('aes-256-gcm', payloadEncryptionKey, value.subarray(ivStart, tagStart));
            decipher.setAAD(aad(model, artifactIdHash));
            decipher.setAuthTag(value.subarray(tagStart, ciphertextStart));
            const plaintext = Buffer.concat([decipher.update(value.subarray(ciphertextStart)), decipher.final()]);
            return JSON.parse(plaintext.toString('utf8')) as T;
        }
    };
}

function aad(model: string, artifactIdHash: Buffer): Buffer {
    return Buffer.from(`${model}\0${artifactIdHash.toString('base64url')}`, 'utf8');
}
