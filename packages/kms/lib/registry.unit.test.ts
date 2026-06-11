import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { DekRegistry, requireDekEnv } from './registry.js';

const testDek = crypto.randomBytes(32).toString('base64');

describe('DekRegistry.load', () => {
    it('should register the plaintext key', async () => {
        const registry = new DekRegistry();
        await registry.load({ NANGO_ENCRYPTION_KEY: testDek });
        expect(registry.get()).toBe(testDek);
    });

    it('should throw when the plaintext key is not 32 bytes', async () => {
        const shortKey = crypto.randomBytes(16).toString('base64');
        await expect(new DekRegistry().load({ NANGO_ENCRYPTION_KEY: shortKey })).rejects.toThrow(/32 bytes/);
    });

    it('should register an empty key when no env is set (encryption disabled)', async () => {
        const registry = new DekRegistry();
        await registry.load({});
        expect(registry.exists()).toBe(true);
        expect(registry.get()).toBe('');
    });

    it('should throw when both envs are set', async () => {
        await expect(new DekRegistry().load({ NANGO_ENCRYPTION_KEY: testDek, NANGO_ENCRYPTION_KEY_WRAPPED: 'anything' })).rejects.toThrow(/mutually exclusive/);
    });

    it('should throw when wrapped is set without a key ARN', async () => {
        await expect(new DekRegistry().load({ NANGO_ENCRYPTION_KEY_WRAPPED: 'anything' })).rejects.toThrow(/NANGO_KMS_KEY_ARN is required/);
    });
});

describe('DekRegistry', () => {
    it('should throw when reading before registration', () => {
        const registry = new DekRegistry();
        expect(registry.exists()).toBe(false);
        expect(() => registry.get()).toThrow(/not loaded/);
    });

    it('should return the registered key', () => {
        const registry = new DekRegistry();
        registry.register(testDek);
        expect(registry.exists()).toBe(true);
        expect(registry.get()).toBe(testDek);
    });

    it('should allow re-registering the same key but not a different one', () => {
        const registry = new DekRegistry();
        registry.register(testDek);
        expect(() => registry.register(testDek)).not.toThrow();
        expect(() => registry.register(crypto.randomBytes(32).toString('base64'))).toThrow(/different encryption key/);
    });

    it('should allow registering an empty key (encryption disabled)', () => {
        const registry = new DekRegistry();
        registry.register('');
        expect(registry.exists()).toBe(true);
        expect(registry.get()).toBe('');
    });
});

describe('requireDekEnv', () => {
    it('should pass when one of the envs is set', () => {
        expect(() => requireDekEnv({ NANGO_ENCRYPTION_KEY: testDek })).not.toThrow();
        expect(() => requireDekEnv({ NANGO_ENCRYPTION_KEY_WRAPPED: 'anything' })).not.toThrow();
    });

    it('should throw when neither env is set', () => {
        expect(() => requireDekEnv({})).toThrow(/is required/);
    });
});
