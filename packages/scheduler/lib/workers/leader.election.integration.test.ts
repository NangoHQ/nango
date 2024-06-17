import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTestDbClient } from '../db/helpers.test';
import { LeaderElection } from './leader.election.js';
import { setTimeout } from 'node:timers/promises';

describe('Election leader', () => {
    const dbClient = getTestDbClient();
    const db = dbClient.db;
    const leaseTimeoutMs = 500;
    const leaderElection = new LeaderElection({
        db,
        leaseTimeoutMs,
        leaderKey: 'test'
    });

    beforeEach(async () => {
        await dbClient.migrate();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    it('should not acquire leadership if already a leader', async () => {
        const res = await leaderElection.elect('node1');
        expect(res.isOk()).toBe(true);

        const res2 = await leaderElection.elect('node2');
        expect(res2.isErr()).toBe(true);
    });
    it('should acquire leadership if previous leader releases the leadership', async () => {
        const res = await leaderElection.elect('node1');
        expect(res.isOk()).toBe(true);

        // first attempt to acquire leadership should fail
        const res2 = await leaderElection.elect('node2');
        expect(res2.isErr()).toBe(true);

        // release leadership
        await leaderElection.release('node1');

        const res3 = await leaderElection.elect('node2');
        expect(res3.isOk()).toBe(true);
    });
    it('should acquire leadership if previous leader did not renew', async () => {
        const res = await leaderElection.elect('node1');
        expect(res.isOk()).toBe(true);

        // first attempt to acquire leadership should fail
        const res2 = await leaderElection.elect('node2');
        expect(res2.isErr()).toBe(true);

        // wait for lease to expire
        await setTimeout(leaseTimeoutMs);

        const res3 = await leaderElection.elect('node2');
        expect(res3.isOk()).toBe(true);
    });
    it('should acquire leadership if already leader', async () => {
        const res = await leaderElection.elect('node1');
        expect(res.isOk()).toBe(true);

        const res2 = await leaderElection.elect('node1');
        expect(res2.isOk()).toBe(true);
    });
});
