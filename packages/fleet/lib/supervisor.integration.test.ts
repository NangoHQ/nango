import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest';
import { Ok } from '@nangohq/utils';
import { STATE_TIMEOUT_MS, Supervisor } from './supervisor.js';
import { getTestDbClient } from './db/helpers.test.js';
import * as deployments from './models/deployments.js';
import * as nodes from './models/nodes.js';
import { generateCommitHash } from './models/helpers.js';
import { createNodeWithAttributes } from './models/helpers.test.js';
import type { Deployment } from '@nangohq/types';
import { FleetError } from './utils/errors.js';

const mockNodeProvider = {
    start: vi.fn().mockResolvedValue(Ok(undefined)),
    terminate: vi.fn().mockResolvedValue(Ok(undefined)),
    verifyUrl: vi.fn().mockResolvedValue(Ok(undefined)),
    mockClear: () => {
        mockNodeProvider.start.mockClear();
        mockNodeProvider.terminate.mockClear();
    }
};

describe('Supervisor', () => {
    const dbClient = getTestDbClient('supervisor');
    const supervisor = new Supervisor({ dbClient, nodeProvider: mockNodeProvider });
    let previousDeployment: Deployment;
    let activeDeployment: Deployment;

    beforeEach(async () => {
        await dbClient.migrate();
        previousDeployment = (await deployments.create(dbClient.db, generateCommitHash().unwrap())).unwrap();
        activeDeployment = (await deployments.create(dbClient.db, generateCommitHash().unwrap())).unwrap();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
        mockNodeProvider.mockClear();
    });

    describe('instances', () => {
        const supervisor1 = new Supervisor({ dbClient, nodeProvider: mockNodeProvider });
        const supervisor2 = new Supervisor({ dbClient, nodeProvider: mockNodeProvider });

        afterEach(async () => {
            await supervisor1.stop();
            await supervisor2.stop();
        });

        it('should have only one processing at a time', async () => {
            const tickSpy1 = vi.spyOn(supervisor1, 'tick');
            const tickSpy2 = vi.spyOn(supervisor2, 'tick');
            supervisor1.start();
            supervisor2.start();
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(tickSpy1).toHaveBeenCalled();
            expect(tickSpy2).toHaveBeenCalledTimes(0);
        });
    });

    it('should start PENDING nodes', async () => {
        const node1 = await createNodeWithAttributes(dbClient.db, { state: 'PENDING', deploymentId: activeDeployment.id });
        const node2 = await createNodeWithAttributes(dbClient.db, { state: 'PENDING', deploymentId: activeDeployment.id });

        await supervisor.tick();

        expect(mockNodeProvider.start).toHaveBeenCalledTimes(2);
        expect(mockNodeProvider.start).toHaveBeenCalledWith(node1);
        expect(mockNodeProvider.start).toHaveBeenCalledWith(node2);

        const node1After = (await nodes.get(dbClient.db, node1.id)).unwrap();
        expect(node1After.state).toBe('STARTING');

        const node2After = (await nodes.get(dbClient.db, node2.id)).unwrap();
        expect(node2After.state).toBe('STARTING');
    });

    it('should timeout STARTING nodes', async () => {
        const tenMinutesAgo = new Date(Date.now() - STATE_TIMEOUT_MS.STARTING - 1);
        const startingNode = await createNodeWithAttributes(dbClient.db, { state: 'STARTING', deploymentId: activeDeployment.id });
        const oldStartingNode = await createNodeWithAttributes(dbClient.db, {
            state: 'STARTING',
            deploymentId: activeDeployment.id,
            lastStateTransitionAt: tenMinutesAgo
        });

        await supervisor.tick();

        // only the old node should be timed out
        const startingNodeAfter = (await nodes.get(dbClient.db, startingNode.id)).unwrap();
        expect(startingNodeAfter.state).toBe('STARTING');

        const oldStartingNodeAfter = (await nodes.get(dbClient.db, oldStartingNode.id)).unwrap();
        expect(oldStartingNodeAfter.state).toBe('ERROR');
    });

    it('should mark OUTDATED nodes', async () => {
        const node = await createNodeWithAttributes(dbClient.db, { state: 'RUNNING', deploymentId: previousDeployment.id });

        await supervisor.tick();

        const nodeAfter = (await nodes.get(dbClient.db, node.id)).unwrap();
        expect(nodeAfter.state).toBe('OUTDATED');
    });

    it('should create new nodes if only OUTDATED', async () => {
        const node = await createNodeWithAttributes(dbClient.db, { state: 'OUTDATED', deploymentId: previousDeployment.id });
        await supervisor.tick();
        const { nodes: pendingNodes } = (await nodes.search(dbClient.db, { states: ['PENDING'] })).unwrap();
        expect(pendingNodes.get(node.routingId)).toMatchObject({
            PENDING: [
                {
                    id: expect.any(Number),
                    state: 'PENDING',
                    routingId: node.routingId,
                    deploymentId: activeDeployment.id,
                    error: null
                }
            ]
        });
    });

    it('should mark nodes as FINISHING if they are OUTDATED and have a new deployment', async () => {
        const routingId = 'routing-id';
        const node = await createNodeWithAttributes(dbClient.db, { state: 'OUTDATED', routingId, deploymentId: previousDeployment.id });
        const newNode = await createNodeWithAttributes(dbClient.db, { state: 'STARTING', routingId, deploymentId: activeDeployment.id });
        await supervisor.tick();

        // new node is not RUNNING yet, OUTDATED node should still be OUTDATED
        const nodeStillOutdated = (await nodes.get(dbClient.db, node.id)).unwrap();
        expect(nodeStillOutdated.state).toBe('OUTDATED');

        // new node is RUNNING, OUTDATED node should be FINISHING
        nodes.transitionTo(dbClient.db, { nodeId: newNode.id, newState: 'RUNNING', url: 'http://myurl' });
        await supervisor.tick();
        const nodeAfter = (await nodes.get(dbClient.db, node.id)).unwrap();
        expect(nodeAfter.state).toBe('FINISHING');
    });

    it('should terminate IDLE nodes', async () => {
        const node1 = await createNodeWithAttributes(dbClient.db, { state: 'IDLE', deploymentId: activeDeployment.id });
        const node2 = await createNodeWithAttributes(dbClient.db, { state: 'IDLE', deploymentId: activeDeployment.id });

        await supervisor.tick();

        expect(mockNodeProvider.terminate).toHaveBeenCalledTimes(2);
        expect(mockNodeProvider.terminate).toHaveBeenCalledWith(node1);
        expect(mockNodeProvider.terminate).toHaveBeenCalledWith(node2);

        const node1After = (await nodes.get(dbClient.db, node1.id)).unwrap();
        expect(node1After.state).toBe('TERMINATED');

        const node2After = (await nodes.get(dbClient.db, node2.id)).unwrap();
        expect(node2After.state).toBe('TERMINATED');
    });

    it('should remove old TERMINATED nodes', async () => {
        const sevenDaysAgo = new Date(Date.now() - STATE_TIMEOUT_MS.TERMINATED - 1);
        const terminatedNode = await createNodeWithAttributes(dbClient.db, { state: 'TERMINATED', deploymentId: activeDeployment.id });
        const oldTerminatedNode = await createNodeWithAttributes(dbClient.db, {
            state: 'TERMINATED',
            deploymentId: activeDeployment.id,
            lastStateTransitionAt: sevenDaysAgo
        });

        await supervisor.tick();

        // only the old node should be removed
        const terminatedNodeAfter = (await nodes.get(dbClient.db, terminatedNode.id)).unwrap();
        expect(terminatedNodeAfter.state).toBe('TERMINATED');

        const oldTerminatedNodeAfter = await nodes.get(dbClient.db, oldTerminatedNode.id);
        if (oldTerminatedNodeAfter.isErr()) {
            expect(oldTerminatedNodeAfter.error).toStrictEqual(new FleetError('node_not_found'));
        } else {
            throw new Error('expected old terminated to be removed');
        }
    });

    it('should remove old ERROR nodes', async () => {
        const sevenDaysAgo = new Date(Date.now() - STATE_TIMEOUT_MS.ERROR - 1);
        const errorNode = await createNodeWithAttributes(dbClient.db, { state: 'ERROR', deploymentId: activeDeployment.id });
        const oldErrorNode = await createNodeWithAttributes(dbClient.db, {
            state: 'ERROR',
            deploymentId: activeDeployment.id,
            lastStateTransitionAt: sevenDaysAgo
        });

        await supervisor.tick();

        // only the old node should be removed
        const errorNodeAfter = (await nodes.get(dbClient.db, errorNode.id)).unwrap();
        expect(errorNodeAfter.state).toBe('ERROR');

        const oldErrorNodeAfter = await nodes.get(dbClient.db, oldErrorNode.id);
        if (oldErrorNodeAfter.isErr()) {
            expect(oldErrorNodeAfter.error).toStrictEqual(new FleetError('node_not_found'));
        } else {
            throw new Error('expected old terminated to be removed');
        }
    });
});
