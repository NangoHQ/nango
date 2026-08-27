import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { getTestDbClient } from '../db/helpers.test.js';
import * as groupOverrides from './groupOverrides.js';

describe('groupOverrides', () => {
    const dbClient = getTestDbClient('scheduler_group_overrides');
    const db = dbClient.db;

    beforeEach(async () => {
        await dbClient.migrate();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    afterAll(async () => {
        await dbClient.destroy();
    });

    it('stores a rate limit override without clearing the other overrides', async () => {
        const groupKey = nanoid();
        (await groupOverrides.upsert(db, { groupKey, maxConcurrency: 3, taskCap: 7 })).unwrap();
        (await groupOverrides.upsert(db, { groupKey, rateLimitPerMin: 500 })).unwrap();

        const overrides = (await groupOverrides.getByGroupKeys(db, [groupKey])).unwrap();

        expect(overrides.get(groupKey)).toEqual({ maxConcurrency: 3, taskCap: 7, rateLimitPerMin: 500 });
    });

    it('only returns groups that have a rate limit override', async () => {
        const withRateLimit = nanoid();
        const withoutRateLimit = nanoid();
        (await groupOverrides.upsert(db, { groupKey: withRateLimit, rateLimitPerMin: 500 })).unwrap();
        (await groupOverrides.upsert(db, { groupKey: withoutRateLimit, maxConcurrency: 3 })).unwrap();

        const rateLimits = (await groupOverrides.getRateLimits(db)).unwrap();

        expect([...rateLimits]).toEqual([[withRateLimit, 500]]);
    });

    it('clears a rate limit override', async () => {
        const groupKey = nanoid();
        (await groupOverrides.upsert(db, { groupKey, rateLimitPerMin: 500 })).unwrap();
        (await groupOverrides.upsert(db, { groupKey, rateLimitPerMin: null })).unwrap();

        expect((await groupOverrides.getRateLimits(db)).unwrap().size).toBe(0);
    });

    it('rejects a rate limit that is not positive', async () => {
        const res = await groupOverrides.upsert(db, { groupKey: nanoid(), rateLimitPerMin: 0 });

        expect(res.isErr()).toBe(true);
    });
});
