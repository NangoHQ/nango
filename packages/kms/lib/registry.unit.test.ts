import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { DekRegistry } from './registry.js';

const testDek = crypto.randomBytes(32).toString('base64');

describe('DekRegistry.create', () => {
    it('should hold the plaintext key', async () => {
        const registry = await DekRegistry.create({ NANGO_ENCRYPTION_KEY: testDek });
        expect(registry.get()).toBe(testDek);
    });

    it('should throw when the plaintext key is not 32 bytes', async () => {
        const shortKey = crypto.randomBytes(16).toString('base64');
        await expect(DekRegistry.create({ NANGO_ENCRYPTION_KEY: shortKey })).rejects.toThrow(/32 bytes/);
    });

    it('should hold an empty key when no env is set (encryption disabled)', async () => {
        const registry = await DekRegistry.create({});
        expect(registry.get()).toBe('');
    });

    // TEMPORARY (KMS rollout validation): wrapped key is unwrapped in shadow mode only;
    // plaintext stays the source of truth and unwrap failures are not fatal.
    it('should resolve from plaintext when both envs are set', async () => {
        const registry = await DekRegistry.create({ NANGO_ENCRYPTION_KEY: testDek, NANGO_ENCRYPTION_KEY_WRAPPED: 'anything' });
        expect(registry.get()).toBe(testDek);
    });

    it('should not use the wrapped key even when it is the only one set', async () => {
        const registry = await DekRegistry.create({ NANGO_ENCRYPTION_KEY_WRAPPED: 'anything' });
        expect(registry.get()).toBe('');
    });
});
