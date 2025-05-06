import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as groups from './groups.js';
import { getTestDbClient } from '../db/helpers.test.js';
import { setTimeout } from 'timers/promises';

describe('Groups', () => {
    const dbClient = getTestDbClient();
    const db = dbClient.db;
    beforeEach(async () => {
        await dbClient.migrate();
        await dbClient.db.raw('TRUNCATE TABLE groups CASCADE');
    });
    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    it('should be successfully created', async () => {
        const group = (
            await groups.upsert(db, {
                key: 'test-group',
                maxConcurrency: 10,
                lastTaskAddedAt: null
            })
        ).unwrap();
        expect(group).toMatchObject({
            key: 'test-group',
            maxConcurrency: 10,
            createdAt: expect.toBeIsoDateTimezone(),
            updatedAt: expect.toBeIsoDateTimezone(),
            deletedAt: null,
            lastTaskAddedAt: null
        });
    });
    it('should be successfully updated', async () => {
        await groups.upsert(db, {
            key: 'original',
            maxConcurrency: 1,
            lastTaskAddedAt: null
        });
        const updated = (
            await groups.upsert(db, {
                key: 'new',
                maxConcurrency: 2,
                lastTaskAddedAt: new Date()
            })
        ).unwrap();
        expect(updated).toMatchObject({
            key: 'new',
            maxConcurrency: 2,
            createdAt: expect.toBeIsoDateTimezone(),
            updatedAt: expect.toBeIsoDateTimezone(),
            deletedAt: null,
            lastTaskAddedAt: expect.toBeIsoDateTimezone()
        });
    });
    it('should be deleted if not used for a while', async () => {
        const intervalMs = 20;
        const groupA = (
            await groups.upsert(db, {
                key: 'groupA',
                maxConcurrency: 1,
                lastTaskAddedAt: new Date()
            })
        ).unwrap();
        const groupB = (
            await groups.upsert(db, {
                key: 'groupB',
                maxConcurrency: 1,
                lastTaskAddedAt: null
            })
        ).unwrap();

        await setTimeout(intervalMs + 1);

        await groups.upsert(db, {
            key: 'groupC',
            maxConcurrency: 1,
            lastTaskAddedAt: new Date()
        });

        const deleted = (await groups.hardDeleteUnused(db, { ms: intervalMs })).unwrap();
        expect(deleted.length).toBe(2);
        expect(deleted.map((group) => group.key)).toEqual([groupA.key, groupB.key]);
    });
});
