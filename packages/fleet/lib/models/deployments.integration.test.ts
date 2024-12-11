import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as deployments from './deployments.js';
import { getTestDbClient } from '../db/helpers.test.js';
import { generateCommitHash } from './helpers.js';

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
            const commitId = generateCommitHash().unwrap();
            const deployment = (await deployments.create(db, commitId)).unwrap();
            expect(deployment.commitId).toBe(commitId);
            expect(deployment.createdAt).toBeInstanceOf(Date);
            expect(deployment.supersededAt).toBe(null);
        });

        it('should supersede any active deployments', async () => {
            const commitId1 = generateCommitHash().unwrap();
            const commitId2 = generateCommitHash().unwrap();

            const deployment1 = (await deployments.create(db, commitId1)).unwrap();
            const deployment2 = (await deployments.create(db, commitId2)).unwrap();

            expect((await deployments.get(db, deployment1.id)).unwrap().supersededAt).not.toBe(null);
            expect((await deployments.get(db, deployment2.id)).unwrap().supersededAt).toBe(null);
        });
    });

    describe('getActive', () => {
        it('should return undefined if no deployments yet', async () => {
            const active = (await deployments.getActive(db)).unwrap();
            expect(active).toBe(undefined);
        });
    });
});
