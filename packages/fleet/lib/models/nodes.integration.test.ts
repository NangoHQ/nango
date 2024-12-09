import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as nodes from './nodes.js';
import * as deployments from './deployments.js';
import { nodeStates } from '../types.js';
import type { NodeState } from '../types.js';
import type { Deployment } from '@nangohq/types';
import { getTestDbClient } from '../db/helpers.test.js';
import { generateCommitHash } from './helpers.js';
import { createNodeWithAttributes } from './helpers.test.js';

describe('Nodes', () => {
    const dbClient = getTestDbClient('nodes');
    const db = dbClient.db;

    let previousDeployment: Deployment;
    let activeDeployment: Deployment;
    beforeEach(async () => {
        await dbClient.migrate();
        previousDeployment = (await deployments.create(db, generateCommitHash().unwrap())).unwrap();
        activeDeployment = (await deployments.create(db, generateCommitHash().unwrap())).unwrap();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    it('should be successfully created', async () => {
        const node = (
            await nodes.create(db, {
                routingId: 'my-routing-id',
                deploymentId: activeDeployment.id,
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
            url: null,
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

    it('should transition between valid states and error when transitioning between invalid states', async () => {
        const doTransition = async ({ nodeId, newState }: { nodeId: number; newState: NodeState }) => {
            if (newState === 'RUNNING') {
                return await nodes.register(db, { nodeId, url: 'http://my-url' });
            } else if (newState === 'ERROR') {
                return await nodes.fail(db, { nodeId, reason: 'my error' });
            } else {
                return await nodes.transitionTo(db, { nodeId, newState });
            }
        };
        for (const from of nodeStates) {
            for (const to of nodeStates) {
                const t = await createNodeWithAttributes(db, { state: from, deploymentId: activeDeployment.id });
                if (nodes.validNodeStateTransitions.find((v) => v.from === from && v.to === to)) {
                    // sleep to ensure lastStateTransitionAt is different from the previous state
                    await new Promise((resolve) => void setTimeout(resolve, 2));
                    const updated = await doTransition({ nodeId: t.id, newState: to });
                    expect(updated.unwrap().state).toBe(to);
                    expect(updated.unwrap().lastStateTransitionAt.getTime()).toBeGreaterThan(t.lastStateTransitionAt.getTime());
                } else {
                    const updated = await doTransition({ nodeId: t.id, newState: to });
                    expect(updated.isErr(), `transition from ${from} to ${to} failed`).toBe(true);
                }
            }
        }
    });

    it('should be searchable', async () => {
        const route1PendingNode = await createNodeWithAttributes(db, { state: 'PENDING', routingId: '1', deploymentId: activeDeployment.id });
        const route1RunningNode = await createNodeWithAttributes(db, {
            state: 'RUNNING',
            routingId: route1PendingNode.routingId,
            deploymentId: previousDeployment.id
        });
        const startingNode = await createNodeWithAttributes(db, { state: 'STARTING', deploymentId: activeDeployment.id });
        const runningNode = await createNodeWithAttributes(db, { state: 'RUNNING', deploymentId: activeDeployment.id });
        const outdatedNode = await createNodeWithAttributes(db, { state: 'OUTDATED', deploymentId: activeDeployment.id });
        const finishingNode = await createNodeWithAttributes(db, { state: 'FINISHING', deploymentId: activeDeployment.id });
        const idleNode = await createNodeWithAttributes(db, { state: 'IDLE', deploymentId: activeDeployment.id });
        const terminatedNode = await createNodeWithAttributes(db, { state: 'TERMINATED', deploymentId: activeDeployment.id });
        const errorNode = await createNodeWithAttributes(db, { state: 'ERROR', deploymentId: activeDeployment.id });

        const searchAllStates = await nodes.search(db, {
            states: ['PENDING', 'STARTING', 'RUNNING', 'OUTDATED', 'FINISHING', 'IDLE', 'TERMINATED', 'ERROR']
        });
        expect(searchAllStates.unwrap().nodes).toEqual(
            new Map([
                [route1PendingNode.routingId, { PENDING: [route1PendingNode], RUNNING: [route1RunningNode] }],
                [startingNode.routingId, { STARTING: [startingNode] }],
                [runningNode.routingId, { RUNNING: [runningNode] }],
                [outdatedNode.routingId, { OUTDATED: [outdatedNode] }],
                [finishingNode.routingId, { FINISHING: [finishingNode] }],
                [idleNode.routingId, { IDLE: [idleNode] }],
                [terminatedNode.routingId, { TERMINATED: [terminatedNode] }],
                [errorNode.routingId, { ERROR: [errorNode] }]
            ])
        );

        const searchRunning = await nodes.search(db, { states: ['RUNNING'] });
        expect(searchRunning.unwrap().nodes).toEqual(
            new Map([
                [route1RunningNode.routingId, { RUNNING: [route1RunningNode] }],
                [runningNode.routingId, { RUNNING: [runningNode] }]
            ])
        );

        const searchWithWrongRoute = await nodes.search(db, { states: ['PENDING'], routingId: terminatedNode.routingId });
        expect(searchWithWrongRoute.unwrap().nodes).toEqual(new Map());
    });

    it('should be searchable (with pagination support)', async () => {
        for (let i = 0; i < 12; i++) {
            await createNodeWithAttributes(db, { state: 'PENDING', routingId: i.toString(), deploymentId: activeDeployment.id });
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

    it('should be able to fail a node', async () => {
        const node = await createNodeWithAttributes(db, { state: 'PENDING', deploymentId: activeDeployment.id });
        const failedNode = (await nodes.fail(db, { nodeId: node.id, reason: 'my error' })).unwrap();
        expect(failedNode.state).toBe('ERROR');
        expect(failedNode.error).toBe('my error');
    });

    it('should be able to register a node', async () => {
        const node = await createNodeWithAttributes(db, { state: 'STARTING', deploymentId: activeDeployment.id });
        expect(node.url).toBe(null);
        const registeredNode = (await nodes.register(db, { nodeId: node.id, url: 'http://my-url' })).unwrap();
        expect(registeredNode.state).toBe('RUNNING');
        expect(registeredNode.url).toBe('http://my-url');
    });

    it('should be able to idle a node', async () => {
        const node = await createNodeWithAttributes(db, { state: 'FINISHING', deploymentId: activeDeployment.id });
        const idledNode = (await nodes.idle(db, { nodeId: node.id })).unwrap();
        expect(idledNode.state).toBe('IDLE');
    });
});
