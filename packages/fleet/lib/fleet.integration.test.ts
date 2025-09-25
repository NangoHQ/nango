import { setTimeout } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { getTestDbClient, testDbUrl } from './db/helpers.test.js';
import { Fleet } from './fleet.js';
import { generateImage } from './models/helpers.js';
import { createNodeWithAttributes } from './models/helpers.test.js';
import * as nodeConfigOverrides from './models/node_config_overrides.js';
import { noopNodeProvider } from './node-providers/noop.js';

describe('fleet', () => {
    const fleetId = 'test_runners';
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

    afterAll(async () => {
        await dbClient.clearDatabase();
    });

    describe('rollout', () => {
        it('should create a new deployment', async () => {
            const image = generateImage();
            const deployment = (await fleet.rollout(image, { verifyImage: false })).unwrap();
            expect(deployment.image).toBe(image);
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
            await nodeConfigOverrides.upsert(dbClient.db, props);
            const image = generateImage();
            await fleet.rollout(image, { verifyImage: false });
            const nodeConfigOverride = (await nodeConfigOverrides.search(dbClient.db, { routingIds: [props.routingId] })).unwrap();
            expect(nodeConfigOverride.get('test')).toStrictEqual({
                id: expect.any(Number),
                routingId: props.routingId,
                image: null,
                cpuMilli: props.cpuMilli,
                memoryMb: props.memoryMb,
                storageMb: props.storageMb,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });
        });
    });

    describe('getRunningNode', () => {
        it('should return a running node', async () => {
            const image = generateImage();
            const deployment = (await fleet.rollout(image, { verifyImage: false })).unwrap();
            const routingId = nanoid();
            const runningNode = await createNodeWithAttributes(dbClient.db, {
                state: 'RUNNING',
                deploymentId: deployment.id,
                routingId
            });
            const res = await fleet.getRunningNode(routingId);
            expect(res.unwrap()).toStrictEqual(runningNode);
        });
        it('should return an outdated node', async () => {
            const image = generateImage();
            const deployment = (await fleet.rollout(image, { verifyImage: false })).unwrap();
            const routingId = nanoid();
            await createNodeWithAttributes(dbClient.db, {
                state: 'PENDING',
                deploymentId: deployment.id,
                routingId
            });
            const outdatedNode = await createNodeWithAttributes(dbClient.db, {
                state: 'OUTDATED',
                deploymentId: deployment.id,
                routingId
            });
            const res = await fleet.getRunningNode(routingId);
            expect(res.unwrap()).toStrictEqual(outdatedNode);
        });
        it('should create a single node when called concurrently', async () => {
            const routingId = nanoid();
            const promises = Array.from({ length: 100 }).map(() => fleet.getRunningNode(routingId).then(() => {}));
            // wait and transition nodes to RUNNING to simulate the nodes being ready
            promises.push(
                setTimeout(200).then(async () => {
                    await dbClient.db.from('nodes').where({ routing_id: routingId }).update({ state: 'RUNNING' });
                })
            );
            await Promise.all(promises);

            const nodes = await dbClient.db.from('nodes').where({ routing_id: routingId });
            expect(nodes.length).toBe(1);
        });
    });

    describe('overrideNodeConfig', () => {
        it('should create node config override if it does not already exist', async () => {
            const props = {
                routingId: 'test',
                image: 'my-image-override',
                cpuMilli: 1000,
                memoryMb: 100,
                storageMb: 100
            };
            const nodeConfigOverride = (await fleet.overrideNodeConfig(props)).unwrap();
            expect(nodeConfigOverride).toStrictEqual({
                id: expect.any(Number),
                routingId: props.routingId,
                image: props.image,
                cpuMilli: props.cpuMilli,
                memoryMb: props.memoryMb,
                storageMb: props.storageMb,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });
        });
        it('should update node config override if it already exists', async () => {
            const props = {
                routingId: 'test',
                image: 'my-image-override',
                cpuMilli: 1000,
                memoryMb: 100,
                storageMb: 100
            };
            await fleet.overrideNodeConfig(props);
            const updatedProps = {
                ...props,
                image: 'my-new-image-override',
                cpuMilli: 2000,
                memoryMb: 2000,
                storageMb: 2000
            };
            const nodeConfigOverride = (await fleet.overrideNodeConfig(updatedProps)).unwrap();
            expect(nodeConfigOverride).toStrictEqual({
                id: expect.any(Number),
                routingId: updatedProps.routingId,
                image: updatedProps.image,
                cpuMilli: updatedProps.cpuMilli,
                memoryMb: updatedProps.memoryMb,
                storageMb: updatedProps.storageMb,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });
        });
        it('should remove node config override if it is set to default', async () => {
            const props = {
                routingId: 'test',
                image: null,
                cpuMilli: 1000,
                memoryMb: 100,
                storageMb: 100
            };
            await fleet.overrideNodeConfig(props);

            const defaultProps = {
                routingId: props.routingId,
                image: null,
                ...noopNodeProvider.defaultNodeConfig
            };
            await fleet.overrideNodeConfig(defaultProps);

            const after = await nodeConfigOverrides.get(dbClient.db, props.routingId);
            expect(after.isErr() && after.error.message).toBe('node_config_override_not_found');
        });
        it('should not remove config override if image is being set', async () => {
            const props = {
                routingId: 'test',
                image: 'my-image-override',
                cpuMilli: 1000,
                memoryMb: 100,
                storageMb: 100
            };
            await fleet.overrideNodeConfig(props);

            const defaultProps = {
                routingId: props.routingId,
                image: props.image,
                cpuMilli: null,
                memoryMb: null,
                storageMb: null
            };
            await fleet.overrideNodeConfig(defaultProps);

            const after = (await nodeConfigOverrides.get(dbClient.db, props.routingId)).unwrap();
            expect(after).toStrictEqual({
                id: expect.any(Number),
                routingId: props.routingId,
                image: props.image,
                cpuMilli: null,
                memoryMb: null,
                storageMb: null,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });
        });
    });
});
