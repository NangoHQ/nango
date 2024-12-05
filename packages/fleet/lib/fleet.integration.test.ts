import { expect, describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import { Fleet } from './fleet.js';
import { getTestDbClient, testDbUrl } from './db/helpers.test.js';
import { generateCommitHash } from './models/helpers.test.js';

describe('fleet', () => {
    const fleetId = 'my_fleet';
    const fleet = new Fleet({ fleetId, dbUrl: testDbUrl });

    beforeAll(async () => {
        await fleet.migrate();
    });

    afterEach(() => {});

    afterAll(async () => {
        await getTestDbClient(fleetId).clearDatabase();
    });

    describe('deploy', () => {
        it('should create a new deployment', async () => {
            const commitId = generateCommitHash();
            const deployment = (await fleet.deploy(commitId)).unwrap();
            expect(deployment.commitId).toBe(commitId);
            expect(deployment.createdAt).toBeInstanceOf(Date);
            expect(deployment.supersededAt).toBe(null);
        });
    });
});
