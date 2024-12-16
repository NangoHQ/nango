import { expect, describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import { Fleet } from './fleet.js';
import { getTestDbClient, testDbUrl } from './db/helpers.test.js';
import { generateCommitHash } from './models/helpers.js';
import { noopNodeProvider } from './node-providers/noop.js';
import * as nodeConfigOverrides from './models/node_config_overrides.js';

describe('fleet', () => {
    const fleetId = 'nango_runners';
    const dbClient = getTestDbClient(fleetId);
    const nodeProvider = noopNodeProvider;
    const fleet = new Fleet({
        fleetId,
        dbUrl: testDbUrl,
        nodeProvider
    });

    beforeAll(async () => {
        await fleet.migrate();
    });

    afterEach(() => {});

    afterAll(async () => {
        await dbClient.clearDatabase();
    });

    describe('rollout', () => {
        it('should create a new deployment', async () => {
            const commitId = generateCommitHash().unwrap();
            const deployment = (await fleet.rollout(commitId)).unwrap();
            expect(deployment.commitId).toBe(commitId);
            expect(deployment.createdAt).toBeInstanceOf(Date);
            expect(deployment.supersededAt).toBe(null);
        });

        it('should cancel all nodeConfigOverrides images', async () => {
            const props = {
                routingId: 'test',
                image: 'my-image-override',
                cpuMilli: 1000,
                memoryMb: 100,
                storageMb: 100
            };
            await nodeConfigOverrides.create(dbClient.db, props);
            const commitId = generateCommitHash().unwrap();
            await fleet.rollout(commitId);
            const nodeConfigOverride = (await nodeConfigOverrides.search(dbClient.db, { routingIds: [props.routingId] })).unwrap();
            expect(nodeConfigOverride.get('test')).toStrictEqual({
                id: expect.any(Number),
                routingId: props.routingId,
                image: nodeProvider.defaultNodeConfig.image,
                cpuMilli: props.cpuMilli,
                memoryMb: props.memoryMb,
                storageMb: props.storageMb,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });
        });
    });
});
