import type { DatabaseClient } from './db/client.js';
import { logger } from './utils/logger.js';
import * as nodes from './models/nodes.js';
import * as deployments from './models/deployments.js';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { FleetError } from './utils/errors.js';
import type { Deployment, Node } from './types.js';
import { setTimeout } from 'node:timers/promises';
import type { NodeProvider } from './node-providers/node_provider.js';

type Action =
    | { type: 'CREATE'; routingId: Node['routingId']; deployment: Deployment }
    | { type: 'START'; node: Node }
    | { type: 'FAIL'; node: Node; reason: 'starting_timeout_reached' }
    | { type: 'OUTDATE'; node: Node }
    | { type: 'TERMINATE'; node: Node }
    | { type: 'REMOVE'; node: Node }
    | { type: 'WARN'; node: Node };

type SupervisorState = 'stopped' | 'running' | 'stopping';

export class Supervisor {
    private state: SupervisorState = 'stopped';
    private dbClient: DatabaseClient;
    private nodeProvider: NodeProvider;
    public STATE_TIMEOUT_MS = {
        STARTING: 5 * 60 * 1000,
        FINISHING: 24 * 60 * 60 * 1000,
        TERMINATED: 7 * 24 * 60 * 60 * 1000,
        ERROR: 7 * 24 * 60 * 60 * 1000
    };

    constructor({ dbClient, nodeProvider }: { dbClient: DatabaseClient; nodeProvider: NodeProvider }) {
        this.dbClient = dbClient;
        this.nodeProvider = nodeProvider;
    }

    public async start(): Promise<void> {
        if (this.state === 'running') {
            logger.warn('Supervisor is already running');
            return;
        }

        this.state = 'running';
        await this.loop();
    }

    public async stop(): Promise<void> {
        this.state = 'stopping';
        logger.info('Supervisor stopped');

        // wait for the loop to finish or timeout
        const waitForStopped = async () => {
            while (this.state !== 'stopped') {
                await setTimeout(100);
            }
        };
        await Promise.race([waitForStopped(), setTimeout(60000)]);
    }

    public async tick(): Promise<void> {
        // TODO: trace
        try {
            const plan = await this.plan();
            if (plan.isOk()) {
                await this.executePlan(plan.value);
            } else {
                logger.error('Supervision error:', plan.error);
                await setTimeout(1000);
            }
        } catch (error) {
            logger.error('Supervision error:', error);
        }
    }

    private async loop(): Promise<void> {
        while (this.state === 'running') {
            // TODO: Lock to prevent multiple instances from running
            await this.tick();
        }
        this.state = 'stopped';
    }

    private async plan(cursor?: number): Promise<Result<Action[]>> {
        const getDeployment = await deployments.getActive(this.dbClient.db);
        if (getDeployment.isErr()) {
            return Err(getDeployment.error);
        }
        if (!getDeployment.value) {
            return Err(new FleetError('no_active_deployment'));
        }
        const deployment = getDeployment.value;
        const plan: Action[] = [];

        const search = await nodes.search(this.dbClient.db, {
            states: ['PENDING', 'STARTING', 'RUNNING', 'OUTDATED', 'FINISHING', 'IDLE', 'TERMINATED', 'ERROR'],
            ...(cursor ? { cursor } : {})
        });
        if (search.isErr()) {
            return Err(search.error);
        }
        for (const [routingId, nodes] of search.value.nodes) {
            // Start pending nodes
            plan.push(...(nodes.PENDING || []).map((node) => ({ type: 'START' as const, node })));

            // Timeout STARTING nodes if they are taking too long
            plan.push(
                ...(nodes.STARTING || []).flatMap((node) => {
                    if (Date.now() - node.lastStateTransitionAt.getTime() > this.STATE_TIMEOUT_MS.STARTING) {
                        return [{ type: 'FAIL' as const, node, reason: 'starting_timeout_reached' as const }];
                    }
                    return [];
                })
            );

            // Mark OUTDATED nodes
            plan.push(
                ...(nodes.RUNNING || []).flatMap((node) => {
                    if (node.deploymentId !== deployment.id) {
                        return [{ type: 'OUTDATE' as const, node }];
                    }
                    return [];
                })
            );

            // if OUTDATED node but no RUNNING or upcoming nodes then create a new one
            if ((nodes.OUTDATED?.length || 0) > 0 && (nodes.RUNNING?.length || 0) + (nodes.STARTING?.length || 0) + (nodes.PENDING?.length || 0) === 0) {
                plan.push({ type: 'CREATE' as const, routingId, deployment });
            }

            // Warn about old finishing nodes
            plan.push(
                ...(nodes.FINISHING || []).flatMap((node) => {
                    if (Date.now() - node.lastStateTransitionAt.getTime() > this.STATE_TIMEOUT_MS.FINISHING) {
                        return [{ type: 'WARN' as const, node }];
                    }
                    return [];
                })
            );

            // Terminate IDLE nodes
            plan.push(...(nodes.IDLE || []).map((node) => ({ type: 'TERMINATE' as const, node })));

            // Remove old terminated nodes
            plan.push(
                ...(nodes.TERMINATED || []).flatMap((node) => {
                    if (Date.now() - node.lastStateTransitionAt.getTime() > this.STATE_TIMEOUT_MS.TERMINATED) {
                        return [{ type: 'REMOVE' as const, node }];
                    }
                    return [];
                })
            );

            // Remove old error nodes
            plan.push(
                ...(nodes.ERROR || []).flatMap((node) => {
                    if (Date.now() - node.lastStateTransitionAt.getTime() > this.STATE_TIMEOUT_MS.ERROR) {
                        return [{ type: 'REMOVE' as const, node }];
                    }
                    return [];
                })
            );
        }

        // Recursively fetch next page of nodes
        if (search.value.nextCursor) {
            const nextPagePlan = await this.plan(search.value.nextCursor);
            if (nextPagePlan.isErr()) {
                logger.error('Failed to get next plan:', nextPagePlan.error);
            } else {
                plan.push(...nextPagePlan.value);
            }
        }

        return Ok(plan);
    }

    private async executePlan(plan: Action[]): Promise<void> {
        for (const action of plan) {
            const result = await this.execute(action);
            if (result.isErr()) {
                logger.error('Failed to execute action:', result.error);
            }
        }
    }

    private async execute(action: Action): Promise<Result<Node>> {
        switch (action.type) {
            case 'CREATE':
                return this.createNode(action);
            case 'START':
                return this.startNode(action);
            case 'OUTDATE':
                return this.outdateNode(action);
            case 'TERMINATE':
                return this.terminateNode(action);
            case 'REMOVE':
                return this.removeNode(action);
            case 'WARN':
                return this.warnNode(action);
            case 'FAIL':
                return this.failNode(action);
        }
    }

    private async createNode({ routingId, deployment }: { type: 'CREATE'; routingId: Node['routingId']; deployment: Deployment }): Promise<Result<Node>> {
        return nodes.create(this.dbClient.db, {
            routingId,
            deploymentId: deployment.id,
            // TODO
            image: `nangohq/my-image:${deployment.commitId}`,
            cpuMilli: 500,
            memoryMb: 512,
            storageMb: 1024
        });
    }

    private async startNode({ node }: { type: 'START'; node: Node }): Promise<Result<Node>> {
        const res = await this.nodeProvider.start(node);
        if (res.isErr()) {
            await this.failNode({
                type: 'FAIL',
                node,
                reason: res.error.message
            });
            return Err(res.error);
        }
        return nodes.transitionTo(this.dbClient.db, {
            nodeId: node.id,
            newState: 'STARTING'
        });
    }

    private async failNode({ node, reason }: { type: 'FAIL'; node: Node; reason: string }): Promise<Result<Node>> {
        const res = await this.nodeProvider.terminate(node);
        if (res.isErr()) {
            logger.error('Failed to terminate node:', res.error);
        }
        return nodes.fail(this.dbClient.db, {
            nodeId: node.id,
            reason
        });
    }

    private async outdateNode({ node }: { type: 'OUTDATE'; node: Node }): Promise<Result<Node>> {
        return nodes.transitionTo(this.dbClient.db, {
            nodeId: node.id,
            newState: 'OUTDATED'
        });
    }

    private async terminateNode({ node }: { type: 'TERMINATE'; node: Node }): Promise<Result<Node>> {
        const res = await this.nodeProvider.terminate(node);
        if (res.isErr()) {
            await this.failNode({
                type: 'FAIL',
                node,
                reason: res.error.message
            });
            return Err(res.error);
        }
        return nodes.transitionTo(this.dbClient.db, {
            nodeId: node.id,
            newState: 'TERMINATED'
        });
    }

    private async removeNode({ node }: { type: 'REMOVE'; node: Node }): Promise<Result<Node>> {
        return nodes.remove(this.dbClient.db, { nodeId: node.id });
    }

    private async warnNode({ node }: { type: 'WARN'; node: Node }): Promise<Result<Node>> {
        // TODO: find a better way to warn and alert
        logger.warn('Node is taking too long to finish:', node);
        return Promise.resolve(Ok(node));
    }
}
