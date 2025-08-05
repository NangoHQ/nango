import crypto from 'crypto';

import { describe, expect, it } from 'vitest';

import { Encryption } from './encryption.js';

describe('Encryption', () => {
    const encryption = new Encryption(crypto.randomBytes(32).toString('base64'));

    const testCases = [
        { name: 'simple string', data: 'Hello, World!' },
        { name: 'empty string', data: '' },
        { name: 'unicode characters', data: '🔐 Hello 世界! café naïve résumé 日本語' },
        { name: 'special characters', data: '!@#$%^&*()_+-=[]{}|;:,.<>?`~\n\t\r\\/"' },
        { name: 'whitespace only', data: '   \n\t\r   ' },
        { name: 'numbers and symbols', data: '1234567890!@#$%^&*()' },
        { name: 'large string', data: 'A'.repeat(100_000) },
        {
            name: 'JSON data',
            data: JSON.stringify({
                user: 'john',
                password: 'secret123',
                metadata: { role: 'admin', timestamp: Date.now() }
            })
        },
        { name: 'binary-like data', data: '\x00\x01\x02\x03\xFF\xFE\xFD' }
    ];

    const methodCombinations = [
        {
            encryptMethod: 'encryptSync' as const,
            decryptMethod: 'decryptSync' as const,
            name: 'sync encrypt + sync decrypt'
        },
        {
            encryptMethod: 'encryptAsync' as const,
            decryptMethod: 'decryptAsync' as const,
            name: 'async encrypt + async decrypt'
        },
        {
            encryptMethod: 'encryptSync' as const,
            decryptMethod: 'decryptAsync' as const,
            name: 'sync encrypt + async decrypt'
        },
        {
            encryptMethod: 'encryptAsync' as const,
            decryptMethod: 'decryptSync' as const,
            name: 'async encrypt + sync decrypt'
        }
    ];

    async function encrypt(method: 'encryptSync' | 'encryptAsync', data: string): Promise<[string, string, string]> {
        try {
            const result = encryption[method](data);
            return await Promise.resolve(result);
        } catch (err) {
            return Promise.reject(new Error(`Encryption failed`, { cause: err }));
        }
    }

    async function decrypt(method: 'decryptSync' | 'decryptAsync', encrypted: string, iv: string, tag: string): Promise<string> {
        try {
            const result = encryption[method](encrypted, iv, tag);
            return await Promise.resolve(result);
        } catch (err) {
            return Promise.reject(new Error(`Decryption failed`, { cause: err }));
        }
    }

    methodCombinations.forEach(({ encryptMethod, decryptMethod, name }) => {
        describe(name, () => {
            describe('Encryption/Decryption', () => {
                testCases.forEach(({ name: testName, data }) => {
                    it(`should handle ${testName}`, async () => {
                        const [encrypted, iv, tag] = await encrypt(encryptMethod, data);
                        const decrypted = await decrypt(decryptMethod, encrypted, iv, tag);
                        expect(decrypted).toBe(data);
                    });
                });
            });

            describe('Error Handling', () => {
                it('should fail with corrupted encrypted data', async () => {
                    const data = 'test data for corruption';
                    const [encrypted, iv, tag] = await encrypt(encryptMethod, data);
                    const corruptedEncrypted = (encrypted.charAt(0) === 'A' ? 'B' : 'A') + encrypted.slice(1);

                    await expect(decrypt(decryptMethod, corruptedEncrypted, iv, tag)).rejects.toThrow();
                });

                it('should fail with wrong IV', async () => {
                    const data = 'test data for IV tampering';
                    const [encrypted, _, tag] = await encrypt(encryptMethod, data);
                    const wrongIv = crypto.randomBytes(12).toString('base64');
                    await expect(decrypt(decryptMethod, encrypted, wrongIv, tag)).rejects.toThrow();
                });

                it('should fail with tampered auth tag', async () => {
                    const data = 'test data for tag tampering';
                    const [encrypted, iv, tag] = await encrypt(encryptMethod, data);
                    const tamperedTag = (tag.charAt(0) === 'A' ? 'B' : 'A') + tag.slice(1);

                    await expect(decrypt(decryptMethod, encrypted, iv, tamperedTag)).rejects.toThrow();
                });
            });

            describe('Key Management', () => {
                describe('Constructor', () => {
                    it('should accept valid base64 key with correct length', () => {
                        const validKey = crypto.randomBytes(32).toString('base64');
                        expect(() => new Encryption(validKey)).not.toThrow();
                    });

                    it('should reject key with invalid length', () => {
                        const shortValidBase64 = crypto.randomBytes(16).toString('base64');
                        const longValidBase64 = crypto.randomBytes(64).toString('base64');

                        expect(() => new Encryption(shortValidBase64)).toThrow(/key/i);
                        expect(() => new Encryption(longValidBase64)).toThrow(/key/i);
                    });

                    it('should reject invalid base64 format', () => {
                        const invalidBase64 = 'a'.repeat(44); // 44 chars but not valid base64
                        const invalidChars = 'invalid-base64-chars!@#$';

                        expect(() => new Encryption(invalidBase64)).toThrow(/base64|key/i);
                        expect(() => new Encryption(invalidChars)).toThrow(/base64|key/i);
                    });
                });

                describe('Key Retrieval', () => {
                    it('should return the correct key via getKey()', () => {
                        const testKey = crypto.randomBytes(32).toString('base64');
                        const testEncryption = new Encryption(testKey);
                        expect(testEncryption.getKey()).toBe(testKey);
                    });
                });
            });
        });
    });
});
