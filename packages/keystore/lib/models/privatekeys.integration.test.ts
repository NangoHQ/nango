import { afterAll, describe, expect, it } from 'vitest';

import { createPrivateKey, decryptPrivateKey, deletePrivateKey, getPrivateKey } from './privatekeys.js';
import { testDb } from '../db/helpers.test.js';

describe('PrivateKey', async () => {
    const db = await testDb.init();

    afterAll(async () => {
        await testDb.clear(db);
    });

    it('should be created and retrieved', async () => {
        const entityType = 'connect_session';
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
        const [keyValue] = createKey.value;
        const getKey = await getPrivateKey(db, keyValue);

        const key = getKey.unwrap();
        expect(key.displayName).toBe(displayName);
        expect(key.entityType).toBe(entityType);

        const decrypted = decryptPrivateKey(key);
        expect(decrypted.unwrap()).toMatch(/^nango_connect_session_[a-f0-9]{64}$/);
    });

    it('should return an error if the key is not found', async () => {
        const res = await getPrivateKey(db, 'abc');
        expect(res.isErr()).toBe(true);
    });

    it('should be deleted', async () => {
        const entityType = 'connect_session';
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1,
            accountId: 1,
            environmentId: 1
        });

        const [keyValue] = createKey.unwrap();
        const getKey = await getPrivateKey(db, keyValue);
        expect(getKey.isOk()).toBe(true);

        const deleteKey = await deletePrivateKey(db, {
            keyValue: keyValue,
            entityType
        });
        expect(deleteKey.isOk()).toBe(true);

        const getKeyAgain = await getPrivateKey(db, keyValue);
        if (getKeyAgain.isOk()) {
            throw new Error('Key should have been deleted');
        }
        expect(getKeyAgain.error.code).toBe('not_found');
    });

    it('should have their last_access_at updated when retrieved', async () => {
        const entityType = 'connect_session';
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1,
            accountId: 1,
            environmentId: 1
        });
        const [keyValue] = createKey.unwrap();
        const getKey = await getPrivateKey(db, keyValue);
        const lastAccessAt1 = getKey.unwrap().lastAccessAt;
        expect(lastAccessAt1).not.toBe(null);

        await new Promise((resolve) => setTimeout(resolve, 10));
        const getKeyAgain = await getPrivateKey(db, keyValue);
        const lastAccessAt2 = getKeyAgain.unwrap().lastAccessAt;
        expect(lastAccessAt2).not.toBe(null);
        expect(lastAccessAt2?.getTime() || 0).toBeGreaterThan(lastAccessAt1?.getTime() || 0);
    });

    it('should be retrieved before it expires', async () => {
        const entityType = 'connect_session';
        const ttlInMs = 100;
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1,
            accountId: 1,
            environmentId: 1,
            ttlInMs
        });
        const [keyValue] = createKey.unwrap();
        const getKey = await getPrivateKey(db, keyValue);
        expect(getKey.isOk()).toBe(true);
    });

    it('should expires', async () => {
        const entityType = 'connect_session';
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
        const [keyValue] = createKey.unwrap();
        const getKey = await getPrivateKey(db, keyValue);
        expect(getKey.isErr()).toBe(true);
    });

    it('should be created and retrieved with only hash stored', async () => {
        const entityType = 'connect_session';
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
        const [keyValue] = createKey.unwrap();
        const getKey = await getPrivateKey(db, keyValue);
        expect(getKey.unwrap().encrypted).toBe(null);
    });
});
