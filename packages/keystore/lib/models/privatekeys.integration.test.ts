import { expect, describe, it, afterAll } from 'vitest';
import { createPrivateKey, getPrivateKey, deletePrivateKey, decryptPrivateKey } from './privatekeys.js';
import { testDb } from '../db/helpers.test.js';

describe('PrivateKey', async () => {
    const db = await testDb.init();

    afterAll(async () => {
        await testDb.clear(db);
    });

    it('should be created and retrieved', async () => {
        const entityType = 'session';
        const displayName = 'this is my key';
        const createKey = await createPrivateKey(db, {
            displayName,
            entityType,
            entityId: 1,
            accountId: 1,
            environmentId: 1
        });
        if (createKey.isErr()) {
            throw createKey.error;
        }
        const keyValue = createKey.value;
        const getKey = await getPrivateKey(db, keyValue);

        const key = getKey.unwrap();
        expect(key.displayName).toBe(displayName);
        expect(key.entityType).toBe(entityType);

        const decrypted = decryptPrivateKey(key);
        expect(decrypted.unwrap()?.substring(0, 14)).toBe('nango_session_');
    });

    it('should return an error if the key is not found', async () => {
        const res = await getPrivateKey(db, 'abc');
        expect(res.isErr()).toBe(true);
    });

    it('should be deleted', async () => {
        const entityType = 'session';
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1,
            accountId: 1,
            environmentId: 1
        });

        const getKey = await getPrivateKey(db, createKey.unwrap());
        expect(getKey.isOk()).toBe(true);

        const deleteKey = await deletePrivateKey(db, {
            keyValue: createKey.unwrap(),
            entityType
        });
        expect(deleteKey.isOk()).toBe(true);

        const getKeyAgain = await getPrivateKey(db, createKey.unwrap());
        if (getKeyAgain.isOk()) {
            throw new Error('Key should have been deleted');
        }
        expect(getKeyAgain.error.code).toBe('not_found');
    });

    it('should have their last_access_at updated when retrieved', async () => {
        const entityType = 'session';
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1,
            accountId: 1,
            environmentId: 1
        });
        const getKey = await getPrivateKey(db, createKey.unwrap());
        const lastAccessAt1 = getKey.unwrap().lastAccessAt;
        expect(lastAccessAt1).not.toBe(null);

        await new Promise((resolve) => setTimeout(resolve, 10));
        const getKeyAgain = await getPrivateKey(db, createKey.unwrap());
        const lastAccessAt2 = getKeyAgain.unwrap().lastAccessAt;
        expect(lastAccessAt2).not.toBe(null);
        expect(lastAccessAt2?.getTime() || 0).toBeGreaterThan(lastAccessAt1?.getTime() || 0);
    });

    it('should be retrieved before it expires', async () => {
        const entityType = 'session';
        const ttlInMs = 30;
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1,
            accountId: 1,
            environmentId: 1,
            ttlInMs
        });
        await new Promise((resolve) => setTimeout(resolve, ttlInMs / 2));
        const getKey = await getPrivateKey(db, createKey.unwrap());
        expect(getKey.isOk()).toBe(true);
    });

    it('should expires', async () => {
        const entityType = 'session';
        const ttlInMs = 5;
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1,
            accountId: 1,
            environmentId: 1,
            ttlInMs
        });
        await new Promise((resolve) => setTimeout(resolve, ttlInMs * 2));
        const getKey = await getPrivateKey(db, createKey.unwrap());
        expect(getKey.isErr()).toBe(true);
    });

    it('should be created and retrieved with only hash stored', async () => {
        const entityType = 'session';
        const displayName = 'this is my key';
        const createKey = await createPrivateKey(
            db,
            {
                displayName,
                entityType,
                entityId: 1,
                accountId: 1,
                environmentId: 1
            },
            { onlyStoreHash: true }
        );
        const getKey = await getPrivateKey(db, createKey.unwrap());
        expect(getKey.unwrap().encrypted).toBe(null);
    });
});
