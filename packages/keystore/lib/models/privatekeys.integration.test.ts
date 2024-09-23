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
            entityId: 1
        });
        if (createKey.isErr()) {
            throw createKey.error;
        }
        const keyValue = createKey.value;
        const getKey = await getPrivateKey(db, {
            keyValue,
            entityType
        });
        if (getKey.isErr()) {
            throw getKey.error;
        }
        expect(getKey.value.displayName).toBe(displayName);
        expect(getKey.value.entityType).toBe(entityType);

        const decrypted = decryptPrivateKey(getKey.value);
        if (decrypted.isErr()) {
            throw decrypted.error;
        }
        expect(decrypted.value.substring(0, 11)).toBe('nango_sess_');
    });

    it('should return an error if the key is not found', async () => {
        const res = await getPrivateKey(db, {
            keyValue: 'abc',
            entityType: 'session'
        });
        expect(res.isErr()).toBe(true);
    });

    it('should return an error if the key exists but entity is incorrect', async () => {
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType: 'session',
            entityId: 1
        });
        if (createKey.isErr()) {
            throw createKey.error;
        }
        const getKey = await getPrivateKey(db, {
            keyValue: createKey.value,
            entityType: 'connection'
        });
        expect(getKey.isErr()).toBe(true);
    });

    it('should be deleted', async () => {
        const entityType = 'session';
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1
        });
        if (createKey.isErr()) {
            throw createKey.error;
        }

        const getKey = await getPrivateKey(db, {
            keyValue: createKey.value,
            entityType
        });
        if (getKey.isErr()) {
            throw getKey.error;
        }

        const deleteKey = await deletePrivateKey(db, {
            keyValue: createKey.value,
            entityType
        });
        expect(deleteKey.isOk()).toBe(true);

        const getKeyAgain = await getPrivateKey(db, {
            keyValue: createKey.value,
            entityType
        });
        expect(getKeyAgain.isErr()).toBe(true);
    });

    it('should have their last_access_at updated when retrieved', async () => {
        const entityType = 'session';
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1
        });
        if (createKey.isErr()) {
            throw createKey.error;
        }
        const getKey = await getPrivateKey(db, {
            keyValue: createKey.value,
            entityType
        });
        if (getKey.isErr()) {
            throw getKey.error;
        }
        const lastAccessAt1 = getKey.value.lastAccessAt;
        expect(lastAccessAt1).not.toBe(null);

        await new Promise((resolve) => setTimeout(resolve, 10));
        const getKeyAgain = await getPrivateKey(db, {
            keyValue: createKey.value,
            entityType
        });
        if (getKeyAgain.isErr()) {
            throw getKeyAgain.error;
        }
        const lastAccessAt2 = getKeyAgain.value.lastAccessAt;
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
            ttlInMs
        });
        if (createKey.isErr()) {
            throw createKey.error;
        }
        await new Promise((resolve) => setTimeout(resolve, ttlInMs / 2));
        const getKey = await getPrivateKey(db, {
            keyValue: createKey.value,
            entityType
        });
        expect(getKey.isOk()).toBe(true);
    });

    it('should expires', async () => {
        const entityType = 'session';
        const ttlInMs = 5;
        const createKey = await createPrivateKey(db, {
            displayName: 'this is my key',
            entityType,
            entityId: 1,
            ttlInMs
        });
        if (createKey.isErr()) {
            throw createKey.error;
        }
        await new Promise((resolve) => setTimeout(resolve, ttlInMs * 2));
        const getKey = await getPrivateKey(db, {
            keyValue: createKey.value,
            entityType
        });
        expect(getKey.isErr()).toBe(true);
    });
});
