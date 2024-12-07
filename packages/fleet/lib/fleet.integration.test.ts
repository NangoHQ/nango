import { expect, describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import { Fleet } from './fleet.js';
import { getTestDbClient, testDbUrl } from './db/helpers.test.js';
import { generateCommitHash } from './models/helpers.js';
import { noopNodeProvider } from './node-providers/noop.js';

describe('fleet', () => {
    const fleetId = 'nango_runners';
    const fleet = new Fleet({ fleetId, dbUrl: testDbUrl, nodeProvider: noopNodeProvider });

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
