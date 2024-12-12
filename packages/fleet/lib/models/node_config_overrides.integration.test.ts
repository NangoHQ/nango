import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as node_config_overrides from './node_config_overrides.js';
import { getTestDbClient } from '../db/helpers.test.js';

describe('Nodes', () => {
    const dbClient = getTestDbClient('nodes');

    beforeEach(async () => {
        await dbClient.migrate();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    const props = {
        routingId: 'routing-id',
        image: 'my-image',
        cpuMilli: 1000,
        memoryMb: 1000,
        storageMb: 1000
    };

    it('should be successfully created', async () => {
        const nodeConfigOverride = (await node_config_overrides.create(dbClient.db, props)).unwrap();
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

    it('should be successfully updated', async () => {
        const nodeConfigOverride = (await node_config_overrides.create(dbClient.db, props)).unwrap();
        const updatedProps = {
            ...props,
            image: 'my-new-image',
            cpuMilli: 2000,
            memoryMb: 2000,
            storageMb: 2000
        };
        const updatedNodeConfigOverride = (await node_config_overrides.update(dbClient.db, updatedProps)).unwrap();
        expect(updatedNodeConfigOverride).toStrictEqual({
            ...nodeConfigOverride,
            image: updatedProps.image,
            cpuMilli: updatedProps.cpuMilli,
            memoryMb: updatedProps.memoryMb,
            storageMb: updatedProps.storageMb,
            updatedAt: expect.any(Date)
        });
    });

    it('should be searchable by routingId', async () => {
        const nodeConfigOverride = (await node_config_overrides.create(dbClient.db, props)).unwrap();
        const found = (await node_config_overrides.search(dbClient.db, { routingIds: [nodeConfigOverride.routingId] })).unwrap();
        expect(found.get(props.routingId)).toStrictEqual(nodeConfigOverride);
    });

    it('should be removable by routingId', async () => {
        const nodeConfigOverride = (await node_config_overrides.create(dbClient.db, props)).unwrap();
        const removed = (await node_config_overrides.remove(dbClient.db, nodeConfigOverride.routingId)).unwrap();
        expect(removed).toStrictEqual(nodeConfigOverride);
    });
});
