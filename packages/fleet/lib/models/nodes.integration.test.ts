import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as nodes from './nodes.js';
import * as deployments from './deployments.js';
import { nodeStates } from '../types.js';
import type { NodeState, Node, RoutingId, Deployment } from '../types.js';
import { getTestDbClient } from '../db/helpers.test.js';
import type { knex } from 'knex';
import { nanoid } from '@nangohq/utils';
import { generateCommitHash } from './helpers.test.js';

describe('Nodes', () => {
    const dbClient = getTestDbClient('nodes');
    const db = dbClient.db;
    let previousDeployment: Deployment;
    let activeDeployment: Deployment;
    beforeEach(async () => {
        await dbClient.migrate();
        previousDeployment = (await deployments.create(db, generateCommitHash())).unwrap();
        activeDeployment = (await deployments.create(db, generateCommitHash())).unwrap();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    it('should be successfully created', async () => {
        const node = (
            await nodes.create(db, {
                routingId: 'my-routing-id',
                deploymentId: activeDeployment.id,
                url: 'http://localhost:3000',
                image: 'nangohq/my-image:latest',
                cpuMilli: 500,
                memoryMb: 1024,
                storageMb: 512
            })
        ).unwrap();
        expect(node).toStrictEqual({
            id: expect.any(Number),
            routingId: 'my-routing-id',
            deploymentId: activeDeployment.id,
            url: 'http://localhost:3000',
            state: 'PENDING',
            image: 'nangohq/my-image:latest',
            cpuMilli: 500,
            memoryMb: 1024,
            storageMb: 512,
            error: null,
            createdAt: expect.any(Date),
            lastStateTransitionAt: expect.any(Date)
        });
    });
    it('should fail to create a node with the same routingId and deploymentId', async () => {
        const routingId = 'my-routing-id';
        await nodes.create(db, {
            routingId,
            deploymentId: activeDeployment.id,
            url: 'http://localhost:3000',
            image: 'nangohq/my-image:latest',
            cpuMilli: 500,
            memoryMb: 1024,
            storageMb: 512
        });
        const result = await nodes.create(db, {
            routingId,
            deploymentId: activeDeployment.id,
            url: 'http://localhost:3000',
            image: 'nangohq/my-image:latest',
            cpuMilli: 500,
            memoryMb: 1024,
            storageMb: 512
        });
        expect(result.isErr()).toBe(true);
    });
    it('should transition between valid states and error when transitioning between invalid states', async () => {
        for (const from of nodeStates) {
            for (const to of nodeStates) {
                const t = await createNodeWithState(db, { state: from, deploymentId: activeDeployment.id });
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
        const route1PendingNode = await createNodeWithState(db, { state: 'PENDING', routingId: '1', deploymentId: activeDeployment.id });
        const route1RunningNode = await createNodeWithState(db, {
            state: 'RUNNING',
            routingId: route1PendingNode.routingId,
            deploymentId: previousDeployment.id
        });
        const startingNode = await createNodeWithState(db, { state: 'STARTING', deploymentId: activeDeployment.id });
        const runningNode = await createNodeWithState(db, { state: 'RUNNING', deploymentId: activeDeployment.id });
        const outdatedNode = await createNodeWithState(db, { state: 'OUTDATED', deploymentId: activeDeployment.id });
        const finishingNode = await createNodeWithState(db, { state: 'FINISHING', deploymentId: activeDeployment.id });
        const idleNode = await createNodeWithState(db, { state: 'IDLE', deploymentId: activeDeployment.id });
        const terminatedNode = await createNodeWithState(db, { state: 'TERMINATED', deploymentId: activeDeployment.id });
        const errorNode = await createNodeWithState(db, { state: 'ERROR', deploymentId: activeDeployment.id });

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
            await createNodeWithState(db, { state: 'PENDING', routingId: i.toString(), deploymentId: activeDeployment.id });
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

async function createNodeWithState(
    db: knex.Knex,
    { state, deploymentId, routingId = nanoid() }: { state: NodeState; deploymentId: number; routingId?: RoutingId }
): Promise<Node> {
    let node = await createNode(db, { routingId, deploymentId });
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

async function createNode(db: knex.Knex, { routingId, deploymentId }: { routingId: RoutingId; deploymentId: number }): Promise<Node> {
    const node = await nodes.create(db, {
        routingId,
        deploymentId,
        url: 'http://localhost:1234',
        image: 'nangohq/my-image:latest',
        cpuMilli: 500,
        memoryMb: 1024,
        storageMb: 512
    });
    return node.unwrap();
}
