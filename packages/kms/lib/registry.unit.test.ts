import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { DekRegistry } from './registry.js';

const testDek = crypto.randomBytes(32).toString('base64');

// The wrapped key is unwrapped through KMS, which unit tests can't reach.
// Here we stub unwrapDek to assert the registry's resolution priority.
const { unwrappedDek, unwrapDekMock } = vi.hoisted(() => {
    const unwrappedDek = 'unwrapped-from-kms';
    return { unwrappedDek, unwrapDekMock: vi.fn(() => Promise.resolve(unwrappedDek)) };
});

vi.mock('./envelope.js', async (importActual) => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const actual = await importActual<typeof import('./envelope.js')>();
    return { ...actual, unwrapDek: unwrapDekMock };
});

describe('DekRegistry.create', () => {
    it('should resolve to the plaintext key', async () => {
        const registry = await DekRegistry.create({ NANGO_ENCRYPTION_KEY: testDek });
        expect(registry.get()).toBe(testDek);
    });

    it('should throw when the plaintext key is not 32 bytes', async () => {
        const shortKey = crypto.randomBytes(16).toString('base64');
        await expect(DekRegistry.create({ NANGO_ENCRYPTION_KEY: shortKey })).rejects.toThrow(/32 bytes/);
    });

    it('should resolve to an empty key when no env is set (encryption disabled)', async () => {
        const registry = await DekRegistry.create({});
        expect(registry.get()).toBe('');
    });

    it('should resolve from the wrapped key', async () => {
        const registry = await DekRegistry.create({
            NANGO_ENCRYPTION_KEY_WRAPPED: 'wrapped-only',
            NANGO_KMS_KEY_ARN: 'arn:aws:kms:test'
        });
        expect(registry.get()).toBe(unwrappedDek);
    });

    it('should throw when both the plaintext and wrapped keys are set', async () => {
        await expect(
            DekRegistry.create({
                NANGO_ENCRYPTION_KEY: testDek,
                NANGO_ENCRYPTION_KEY_WRAPPED: 'wrapped-both',
                NANGO_KMS_KEY_ARN: 'arn:aws:kms:test'
            })
        ).rejects.toThrow(/mutually exclusive/);
    });

    it('should throw when the wrapped key is set without a wrapping-key identifier', async () => {
        await expect(DekRegistry.create({ NANGO_ENCRYPTION_KEY_WRAPPED: 'no-arn' })).rejects.toThrow(
            /one of NANGO_KMS_KEY_ARN or NANGO_GCP_KMS_KEY_NAME is required/
        );
    });

    it('should resolve from the wrapped key via GCP KMS', async () => {
        unwrapDekMock.mockClear();
        const gcpKmsKeyName = 'projects/test/locations/global/keyRings/nango/cryptoKeys/dek';
        const registry = await DekRegistry.create({
            NANGO_ENCRYPTION_KEY_WRAPPED: 'wrapped-gcp',
            NANGO_GCP_KMS_KEY_NAME: gcpKmsKeyName
        });
        expect(registry.get()).toBe(unwrappedDek);
        expect(unwrapDekMock).toHaveBeenCalledWith({
            wrapped: 'wrapped-gcp',
            gcpKmsKeyName,
            expectedContext: { purpose: 'global_dek', app: 'nango' }
        });
    });

    it('should throw when both AWS and GCP wrapping-key identifiers are set', async () => {
        await expect(
            DekRegistry.create({
                NANGO_ENCRYPTION_KEY_WRAPPED: 'wrapped-both-kms',
                NANGO_KMS_KEY_ARN: 'arn:aws:kms:test',
                NANGO_GCP_KMS_KEY_NAME: 'projects/test/locations/global/keyRings/nango/cryptoKeys/dek'
            })
        ).rejects.toThrow(/NANGO_KMS_KEY_ARN and NANGO_GCP_KMS_KEY_NAME are mutually exclusive/);
    });
});
