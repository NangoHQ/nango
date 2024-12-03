import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as deployments from './deployments.js';
import { getTestDbClient } from '../db/helpers.test.js';
import { generateCommitHash } from './helpers.test.js';

describe('Deployments', () => {
    const dbClient = getTestDbClient('deployments');
    const db = dbClient.db;
    beforeEach(async () => {
        await dbClient.migrate();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    describe('create', () => {
        it('should create a deployment', async () => {
            const commitId = generateCommitHash();
            const deployment = (await deployments.create(db, commitId)).unwrap();
            expect(deployment.commitId).toBe(commitId);
            expect(deployment.createdAt).toBeInstanceOf(Date);
            expect(deployment.supersededAt).toBe(null);
        });
        it('should supersede any active deployments', async () => {
            const commitId1 = generateCommitHash();
            const commitId2 = generateCommitHash();

            await deployments.create(db, commitId1);
            await deployments.create(db, commitId2);

            const deployment1 = (await deployments.get(db, commitId1)).unwrap();
            const deployment2 = (await deployments.get(db, commitId2)).unwrap();

            expect(deployment1.supersededAt).not.toBe(null);
            expect(deployment2.supersededAt).toBe(null);
        });
    });

    describe('getActive', () => {
        it('should return undefined if no deployments yet', async () => {
            const active = (await deployments.getActive(db)).unwrap();
            expect(active).toBe(undefined);
        });
    });
});
