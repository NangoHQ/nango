import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as nodes from './nodes.js';
import * as deployments from './deployments.js';
import { nodeStates } from '../types.js';
import type { NodeState, Node, RoutingId } from '../types.js';
import { getTestDbClient } from '../db/helpers.test.js';
import type { knex } from 'knex';
import { nanoid } from '@nangohq/utils';
import { generateCommitHash } from './helpers.test.js';

const activeDeployment = generateCommitHash();

describe('Nodes', () => {
    const dbClient = getTestDbClient('nodes');
    const db = dbClient.db;
    beforeEach(async () => {
        await dbClient.migrate();
        await deployments.create(db, activeDeployment);
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    it('should be successfully created', async () => {
        const node = (
            await nodes.create(db, {
                routingId: 'my-routing-id',
                deploymentId: activeDeployment,
                url: 'http://localhost:3000',
                image: 'nangohq/my-image:latest',
                cpuMilli: 500,
                memoryMb: 1024,
                storageMb: 512
            })
        ).unwrap();
        expect(node).toMatchObject({
            id: expect.any(Number),
            routingId: 'my-routing-id',
            deploymentId: activeDeployment,
            url: 'http://localhost:3000',
            state: 'PENDING',
            image: 'nangohq/my-image:latest',
            cpuMilli: 500,
            memoryMb: 1024,
            storageMb: 512,
            error: null
        });
    });
    it('should transition between valid states and error when transitioning between invalid states', async () => {
        for (const from of nodeStates) {
            for (const to of nodeStates) {
                const t = await createNodeWithState(db, from);
                if (nodes.validNodeStateTransitions.find((v) => v.from === from && v.to === to)) {
                    // sleep to ensure lastStateTransitionAt is different from the previous state
                    await new Promise((resolve) => void setTimeout(resolve, 2));
                    const updated = await nodes.transitionTo(db, { nodeId: t.id, newState: to });
                    expect(updated.unwrap().state).toBe(to);
                    expect(updated.unwrap().lastStateTransitionAt.getTime()).toBeGreaterThan(t.lastStateTransitionAt.getTime());
                } else {
                    const updated = await nodes.transitionTo(db, { nodeId: t.id, newState: to });
                    expect(updated.isErr(), `transition from ${from} to ${to} failed`).toBe(true);
                }
            }
        }
    });
    it('should be searchable', async () => {
        const route1PendingNode = await createNodeWithState(db, 'PENDING', '1');
        const route1RunningNode = await createNodeWithState(db, 'RUNNING', route1PendingNode.routingId);
        const startingNode = await createNodeWithState(db, 'STARTING');
        const runningNode = await createNodeWithState(db, 'RUNNING');
        const outdatedNode = await createNodeWithState(db, 'OUTDATED');
        const finishingNode = await createNodeWithState(db, 'FINISHING');
        const idleNode = await createNodeWithState(db, 'IDLE');
        const terminatedNode = await createNodeWithState(db, 'TERMINATED');
        const errorNode = await createNodeWithState(db, 'ERROR');

        const searchAllStates = await nodes.search(db, {
            states: ['PENDING', 'STARTING', 'RUNNING', 'OUTDATED', 'FINISHING', 'IDLE', 'TERMINATED', 'ERROR']
        });
        expect(searchAllStates.unwrap().nodes).toEqual(
            new Map([
                [route1PendingNode.routingId, [route1PendingNode, route1RunningNode]],
                [startingNode.routingId, [startingNode]],
                [runningNode.routingId, [runningNode]],
                [outdatedNode.routingId, [outdatedNode]],
                [finishingNode.routingId, [finishingNode]],
                [idleNode.routingId, [idleNode]],
                [terminatedNode.routingId, [terminatedNode]],
                [errorNode.routingId, [errorNode]]
            ])
        );

        const searchRunning = await nodes.search(db, { states: ['RUNNING'] });
        expect(searchRunning.unwrap().nodes).toEqual(
            new Map([
                [route1RunningNode.routingId, [route1RunningNode]],
                [runningNode.routingId, [runningNode]]
            ])
        );

        const searchWithWrongRoute = await nodes.search(db, { states: ['PENDING'], routingId: terminatedNode.routingId });
        expect(searchWithWrongRoute.unwrap().nodes).toEqual(new Map());
    });
    it('should be searchable (with pagination support)', async () => {
        for (let i = 0; i < 12; i++) {
            await createNodeWithState(db, 'PENDING', i.toString());
        }
        const searchFirstPage = (await nodes.search(db, { states: ['PENDING'], limit: 5 })).unwrap();
        expect(searchFirstPage.nodes.size).toBe(5);
        expect(searchFirstPage.nextCursor).toBe(6);

        const searchSecondPage = (await nodes.search(db, { states: ['PENDING'], limit: 5, cursor: searchFirstPage.nextCursor! })).unwrap();
        expect(searchSecondPage.nodes.size).toBe(5);
        expect(searchSecondPage.nextCursor).toBe(11);

        const searchThirdPage = (await nodes.search(db, { states: ['PENDING'], limit: 5, cursor: searchSecondPage.nextCursor! })).unwrap();
        expect(searchThirdPage.nodes.size).toBe(2);
        expect(searchThirdPage.nextCursor).toBe(undefined);
    });
});

async function createNodeWithState(db: knex.Knex, state: NodeState, routingId: RoutingId = nanoid()): Promise<Node> {
    let node = await createNode(db, routingId);
    if (state == 'ERROR') {
        return (await nodes.fail(db, { nodeId: node.id, error: 'my error' })).unwrap();
    }
    // transition to the desired state
    while (node.state !== state) {
        const nextState = nodes.validNodeStateTransitions.find((v) => v.from === node.state)?.to;
        if (nextState) {
            node = (await nodes.transitionTo(db, { nodeId: node.id, newState: nextState })).unwrap();
        } else {
            throw new Error(`Cannot transition node to state '${state}'`);
        }
    }
    return node;
}

async function createNode(db: knex.Knex, routingId: RoutingId): Promise<Node> {
    const node = await nodes.create(db, {
        routingId,
        deploymentId: activeDeployment,
        url: 'http://localhost:1234',
        image: 'nangohq/my-image:latest',
        cpuMilli: 500,
        memoryMb: 1024,
        storageMb: 512
    });
    return node.unwrap();
}
