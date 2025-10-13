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

    it('should allow setting expiration on a key', async () => {
        await store.set('key', 'value', { canOverride: true });
        await store.expires('key', 10);
        await new Promise((resolve) => setTimeout(resolve, 20));
        const value = await store.get('key');
        expect(value).toBeNull();
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
    it('should set/get hash values', async () => {
        await store.hSetAll('hashKey', { field1: 'value1', field2: 'value2' }, { canOverride: true });
        const hash = await store.hGetAll('hashKey');
        expect(hash).toEqual({ field1: 'value1', field2: 'value2' });
        const field1 = await store.hGet('hashKey', 'field1');
        expect(field1).toEqual('value1');
        const field2 = await store.hGet('hashKey', 'field2');
        expect(field2).toEqual('value2');
        await store.hSet('hashKey', 'field3', 'value3', { canOverride: true });
        const field3 = await store.hGet('hashKey', 'field3');
        expect(field3).toEqual('value3');
        const nonExistentField = await store.hGet('hashKey', 'nonExistentField');
        expect(nonExistentField).toBeNull();
    });
    it('should increment hash fields', async () => {
        await expect(store.hIncrBy('hashKey', 'field1', 5)).resolves.toEqual(5);
        await expect(store.hIncrBy('hashKey', 'field1', 3)).resolves.toEqual(8);
        await expect(store.hIncrBy('hashKey', 'field2', -2)).resolves.toEqual(-2);
        const hash = await store.hGetAll('hashKey');
        expect(hash).toEqual({ field1: '8', field2: '-2' });
    });
});
