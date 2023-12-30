import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryKVStore } from './InMemoryStore';

describe('InMemoryKVStore', () => {
    let store: InMemoryKVStore;
    beforeEach(() => {
        store = new InMemoryKVStore();
    });

    it('should set and get a value', async () => {
        store.set('key', 'value');
        const value = await store.get('key');
        expect(value).toEqual('value');
    });

    it('should return null for a non-existent key', async () => {
        const value = await store.get('do-not-exist');
        expect(value).toBeNull();
    });

    it('should allow overriding a key', async () => {
        store.set('key', 'value');
        await store.set('key', 'value2', true);
        const value = await store.get('key');
        expect(value).toEqual('value2');
    });

    it('should not allow overriding a key', async () => {
        store.set('key', 'value');
        await expect(store.set('key', 'value2', false)).rejects.toEqual('Key already exists');
    });

    it('should return null for a key that has expired', async () => {
        const ttlInMs = 1000;
        store.set('key', 'value', true, ttlInMs);
        await new Promise((resolve) => setTimeout(resolve, ttlInMs * 2));
        const value = await store.get('key');
        expect(value).toBeNull();
    });

    it('should not return null for a key that has not expired', async () => {
        const ttlInMs = 2000;
        store.set('key', 'value', true, ttlInMs);
        await new Promise((resolve) => setTimeout(resolve, ttlInMs / 2));
        const value = await store.get('key');
        expect(value).toEqual('value');
    });

    it('should allow setting an expired key', async () => {
        store.set('key', 'value', false, 10);
        await new Promise((resolve) => setTimeout(resolve, 20));
        await expect(store.set('key', 'value', false)).resolves.not.toThrow();
    });

    it('should allow setting a key with a TTL of 0', async () => {
        store.set('key', 'value', true, 0);
        const value = await store.get('key');
        expect(value).toEqual('value');
    });

    it('should allow deleting a key', async () => {
        store.delete('key');
        const value = await store.get('key');
        expect(value).toBeNull();
    });
    it('should allow checking if a key exists', async () => {
        await expect(store.exists('key')).resolves.toEqual(false);
        store.set('key', 'value');
        await expect(store.exists('key')).resolves.toEqual(true);
    });
});
