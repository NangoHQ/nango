import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InMemoryKVStore } from './InMemoryStore.js';

describe('InMemoryKVStore', () => {
    let store: InMemoryKVStore;
    beforeEach(() => {
        store = new InMemoryKVStore();
    });

    afterEach(async () => {
        await store.destroy();
    });

    it('should set and get a value', async () => {
        await store.set('key', 'value');
        const value = await store.get('key');
        expect(value).toEqual('value');
    });

    it('should return null for a non-existent key', async () => {
        const value = await store.get('do-not-exist');
        expect(value).toBeNull();
    });

    it('should allow overriding a key', async () => {
        await store.set('key', 'value');
        await store.set('key', 'value2', { canOverride: true });
        const value = await store.get('key');
        expect(value).toEqual('value2');
    });

    it('should not allow overriding a key', async () => {
        await store.set('key', 'value');
        await expect(store.set('key', 'value2', { canOverride: false })).rejects.toEqual(new Error('set_key_already_exists'));
    });

    it('should return null for a key that has expired', async () => {
        const ttlMs = 100;
        await store.set('key', 'value', { canOverride: true, ttlMs });
        await new Promise((resolve) => setTimeout(resolve, ttlMs * 2));
        const value = await store.get('key');
        expect(value).toBeNull();
    });

    it('should not return null for a key that has not expired', async () => {
        const ttlMs = 200;
        await store.set('key', 'value', { canOverride: true, ttlMs });
        await new Promise((resolve) => setTimeout(resolve, ttlMs / 2));
        const value = await store.get('key');
        expect(value).toEqual('value');
    });

    it('should allow setting an expired key', async () => {
        await store.set('key', 'value', { canOverride: false, ttlMs: 10 });
        await new Promise((resolve) => setTimeout(resolve, 20));
        await expect(store.set('key', 'value', { canOverride: false })).resolves.not.toThrow();
    });

    it('should allow setting a key with a TTL of 0', async () => {
        await store.set('key', 'value', { canOverride: true, ttlMs: 0 });
        const value = await store.get('key');
        expect(value).toEqual('value');
    });

    it('should allow deleting a key', async () => {
        await store.delete('key');
        const value = await store.get('key');
        expect(value).toBeNull();
    });
    it('should allow checking if a key exists', async () => {
        await expect(store.exists('key')).resolves.toEqual(false);
        await store.set('key', 'value');
        await expect(store.exists('key')).resolves.toEqual(true);
    });

    it('should increment a key', async () => {
        await expect(store.incr('key')).resolves.toEqual(1);
        await expect(store.incr('key')).resolves.toEqual(2);
        await expect(store.incr('key', { delta: 3 })).resolves.toEqual(5);
        await expect(store.incr('key', { delta: -5 })).resolves.toEqual(0);
    });
    it('should increment a key with TTL', async () => {
        const ttlMs = 100;
        await expect(store.incr('key', { ttlMs })).resolves.toEqual(1);
        await new Promise((resolve) => setTimeout(resolve, ttlMs * 2));
        await expect(store.incr('key', { ttlMs })).resolves.toEqual(1);
    });
    it('should scan keys', async () => {
        await store.set('key1', 'value1');
        await store.set('key2', 'value2');
        await store.set('another-key', 'value3');
        const keys = [];
        for await (const key of store.scan('key*')) {
            keys.push(key);
        }
        expect(keys.sort()).toEqual(['key1', 'key2']);
    });

    describe('setIfValueEquals', () => {
        it('should set when the current value matches', async () => {
            await store.set('k', 'owner-a', { canOverride: true, ttlMs: 10_000 });
            await expect(store.setIfValueEquals('k', 'owner-a', 'owner-a', 20_000)).resolves.toBe(true);
            expect(await store.get('k')).toBe('owner-a');
        });

        it('should not set when the value differs', async () => {
            await store.set('k', 'owner-b', { canOverride: true, ttlMs: 10_000 });
            await expect(store.setIfValueEquals('k', 'owner-a', 'owner-a', 20_000)).resolves.toBe(false);
            expect(await store.get('k')).toBe('owner-b');
        });

        it('should not set when the key is missing', async () => {
            await expect(store.setIfValueEquals('missing', 'x', 'x', 1000)).resolves.toBe(false);
        });
    });

    describe('deleteIfValueEquals', () => {
        it('should delete when the current value matches', async () => {
            await store.set('k', 'owner-a', { canOverride: true, ttlMs: 10_000 });
            await expect(store.deleteIfValueEquals('k', 'owner-a')).resolves.toBe(true);
            expect(await store.get('k')).toBeNull();
        });

        it('should not delete when the value differs', async () => {
            await store.set('k', 'owner-b', { canOverride: true, ttlMs: 10_000 });
            await expect(store.deleteIfValueEquals('k', 'owner-a')).resolves.toBe(false);
            expect(await store.get('k')).toBe('owner-b');
        });

        it('should not delete when the key is missing', async () => {
            await expect(store.deleteIfValueEquals('missing', 'x')).resolves.toBe(false);
        });
    });

    describe('atomic compare-and-mutate under concurrent callers', () => {
        it('setIfValueEquals: many same-owner refreshes all succeed and keep the owner', async () => {
            await store.set('race-k', 'owner-a', { canOverride: true, ttlMs: 100_000 });
            const n = 50;
            const results = await Promise.all(Array.from({ length: n }, () => store.setIfValueEquals('race-k', 'owner-a', 'owner-a', 200_000)));
            expect(results.every(Boolean)).toBe(true);
            expect(await store.get('race-k')).toBe('owner-a');
        });

        it('setIfValueEquals: parallel wrong-owner refreshes never overwrite the holder', async () => {
            await store.set('race-k2', 'owner-b', { canOverride: true, ttlMs: 100_000 });
            const n = 50;
            const results = await Promise.all(Array.from({ length: n }, () => store.setIfValueEquals('race-k2', 'owner-a', 'owner-a', 200_000)));
            expect(results.every((r) => !r)).toBe(true);
            expect(await store.get('race-k2')).toBe('owner-b');
        });

        it('deleteIfValueEquals: at most one concurrent delete succeeds for the same value', async () => {
            await store.set('race-del', 'v', { canOverride: true, ttlMs: 100_000 });
            const n = 100;
            const results = await Promise.all(Array.from({ length: n }, () => store.deleteIfValueEquals('race-del', 'v')));
            expect(results.filter(Boolean).length).toBe(1);
            expect(await store.get('race-del')).toBeNull();
        });

        it('deleteIfValueEquals: parallel wrong-owner deletes never remove the key', async () => {
            await store.set('race-del2', 'owner-b', { canOverride: true, ttlMs: 100_000 });
            const results = await Promise.all(Array.from({ length: 40 }, () => store.deleteIfValueEquals('race-del2', 'owner-a')));
            expect(results.every((r) => !r)).toBe(true);
            expect(await store.get('race-del2')).toBe('owner-b');
        });
    });
});
