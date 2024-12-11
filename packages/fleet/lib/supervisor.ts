import type { DatabaseClient } from './db/client.js';
import { logger } from './utils/logger.js';
import * as nodes from './models/nodes.js';
import * as deployments from './models/deployments.js';
import { Err, Ok, retryWithBackoff } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { FleetError } from './utils/errors.js';
import type { Node } from './types.js';
import type { Deployment } from '@nangohq/types';
import { setTimeout } from 'node:timers/promises';
import type { NodeProvider } from './node-providers/node_provider.js';
import { envs } from './env.js';
import { withPgLock } from './utils/locking.js';

type Operation =
    | { type: 'CREATE'; routingId: Node['routingId']; deployment: Deployment }
    | { type: 'START'; node: Node }
    | { type: 'FAIL'; node: Node; reason: 'starting_timeout_reached' }
    | { type: 'OUTDATE'; node: Node }
    | { type: 'FINISHING'; node: Node }
    | { type: 'FINISHING_TIMEOUT'; node: Node }
    | { type: 'TERMINATE'; node: Node }
    | { type: 'REMOVE'; node: Node };

type SupervisorState = 'stopped' | 'running' | 'stopping';

export const STATE_TIMEOUT_MS = {
    STARTING: envs.FLEET_TIMEOUT_STARTING_MS,
    FINISHING: envs.FLEET_TIMEOUT_FINISHING_MS,
    TERMINATED: envs.FLEET_TIMEOUT_TERMINATED_MS,
    ERROR: envs.FLEET_TIMEOUT_ERROR_MS
};

// Shorten timeouts when running Nango locally
if (envs.RUNNER_TYPE === 'LOCAL') {
    STATE_TIMEOUT_MS.STARTING = 15 * 1000;
    STATE_TIMEOUT_MS.FINISHING = 15 * 1000;
}

export class Supervisor {
    private state: SupervisorState = 'stopped';
    private dbClient: DatabaseClient;
    private nodeProvider: NodeProvider;
    private tickCancelled: boolean = false;

    constructor({ dbClient, nodeProvider }: { dbClient: DatabaseClient; nodeProvider: NodeProvider }) {
        this.dbClient = dbClient;
        this.nodeProvider = nodeProvider;
    }

    public async start(): Promise<void> {
        if (this.state === 'running') {
            logger.info('Fleet supervisor is already running');
            return;
        }

        this.state = 'running';
        return this.loop();
    }

    public async stop(): Promise<void> {
        if (this.state === 'stopped') {
            logger.info('Fleet supervisor is already stopped');
            return;
        }
        this.state = 'stopping';
        logger.info(`Stopping fleet supervisor...`);

        // wait for the loop to finish or timeout
        const waitForStopped = async () => {
            while (this.state !== 'stopped') {
                await setTimeout(1000);
            }
        };
        await Promise.race([waitForStopped(), setTimeout(envs.FLEET_SUPERVISOR_TIMEOUT_STOP_MS)]);

        logger.info('Fleet supervisor stopped');
    }

    public async tick(): Promise<Result<void>> {
        // TODO: trace
        try {
            this.tickCancelled = false;
            const plan = await this.plan();
            if (plan.isOk()) {
                await this.executePlan(plan.value);
                return Ok(undefined);
            } else {
                return Err(plan.error);
            }
        } catch (err) {
            return Err(new FleetError('supervisor_tick_failed', { cause: err }));
        }
    }

    private async loop(): Promise<void> {
        const getDeployment = await deployments.getActive(this.dbClient.db);
        if (getDeployment.isErr() || !getDeployment.value) {
            logger.error('Failed starting supervisor: no active deployment');
            this.state = 'stopped';
            return;
        }

        while (this.state === 'running') {
            const res = await withPgLock({
                db: this.dbClient.db,
                lockKey: `fleet_supervisor`,
                fn: async () => {
                    return await this.tick();
                },
                timeoutMs: envs.FLEET_SUPERVISOR_TIMEOUT_TICK_MS,
                onTimeout: () => {
                    this.tickCancelled = true;
                    return Promise.resolve();
                }
            });
            if (res.isErr()) {
                await setTimeout(envs.FLEET_SUPERVISOR_RETRY_DELAY_MS);
                logger.warning('Fleet supervisor:', res.error);
            }
        }
        this.state = 'stopped';
    }

    private async plan(cursor?: number): Promise<Result<Operation[]>> {
        const getDeployment = await deployments.getActive(this.dbClient.db);
        if (getDeployment.isErr()) {
            return Err(getDeployment.error);
        }
        if (!getDeployment.value) {
            return Err(new FleetError('no_active_deployment'));
        }
        const deployment = getDeployment.value;
        const plan: Operation[] = [];

        const search = await nodes.search(this.dbClient.db, {
            states: ['PENDING', 'STARTING', 'RUNNING', 'OUTDATED', 'FINISHING', 'IDLE', 'TERMINATED', 'ERROR'],
            ...(cursor ? { cursor } : {})
        });
        if (search.isErr()) {
            return Err(search.error);
        }
        for (const [routingId, nodes] of search.value.nodes) {
            // Start pending nodes
            plan.push(...(nodes.PENDING || []).map<Operation>((node) => ({ type: 'START', node })));

            // Timeout STARTING nodes if they are taking too long
            plan.push(
                ...(nodes.STARTING || []).flatMap<Operation>((node) => {
                    if (Date.now() - node.lastStateTransitionAt.getTime() > STATE_TIMEOUT_MS.STARTING) {
                        return [{ type: 'FAIL', node, reason: 'starting_timeout_reached' as const }];
                    }
                    return [];
                })
            );

            // Mark OUTDATED nodes
            plan.push(
                ...(nodes.RUNNING || []).flatMap<Operation>((node) => {
                    if (node.deploymentId !== deployment.id) {
                        return [{ type: 'OUTDATE', node }];
                    }
                    return [];
                })
            );

            // Mark OUTDATED nodes to FINISHING once there is RUNNING nodes to replace them
            plan.push(
                ...(nodes.OUTDATED || []).flatMap<Operation>((node) => {
                    if ((nodes.RUNNING?.length || 0) > 0) {
                        return [{ type: 'FINISHING', node }];
                    }
                    return [];
                })
            );

            // if OUTDATED node but no RUNNING or upcoming nodes then create a new one
            if ((nodes.OUTDATED?.length || 0) > 0 && (nodes.RUNNING?.length || 0) + (nodes.STARTING?.length || 0) + (nodes.PENDING?.length || 0) === 0) {
                plan.push({ type: 'CREATE', routingId, deployment });
            }

            // Warn about old finishing nodes
            plan.push(
                ...(nodes.FINISHING || []).flatMap<Operation>((node) => {
                    if (Date.now() - node.lastStateTransitionAt.getTime() > STATE_TIMEOUT_MS.FINISHING) {
                        return [{ type: 'FINISHING_TIMEOUT', node }];
                    }
                    return [];
                })
            );

            // Terminate IDLE nodes
            plan.push(...(nodes.IDLE || []).map((node) => ({ type: 'TERMINATE' as const, node })));

            // Remove old terminated nodes
            plan.push(
                ...(nodes.TERMINATED || []).flatMap<Operation>((node) => {
                    if (Date.now() - node.lastStateTransitionAt.getTime() > STATE_TIMEOUT_MS.TERMINATED) {
                        return [{ type: 'REMOVE', node }];
                    }
                    return [];
                })
            );

            // Remove old error nodes
            plan.push(
                ...(nodes.ERROR || []).flatMap<Operation>((node) => {
                    if (Date.now() - node.lastStateTransitionAt.getTime() > STATE_TIMEOUT_MS.ERROR) {
                        return [{ type: 'REMOVE', node }];
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

    private async executePlan(plan: Operation[]): Promise<void> {
        for (const action of plan) {
            if (this.tickCancelled) {
                return;
            }
            const result = await this.execute(action);
            if (result.isErr()) {
                logger.error('Failed to execute action:', result.error);
            }
        }
    }

    private async execute(action: Operation): Promise<Result<Node>> {
        switch (action.type) {
            case 'CREATE':
                return this.createNode(action);
            case 'START':
                return this.startNode(action);
            case 'OUTDATE':
                return this.outdateNode(action);
            case 'FINISHING':
                return this.finishingNode(action);
            case 'TERMINATE':
                return this.terminateNode(action);
            case 'REMOVE':
                return this.removeNode(action);
            case 'FINISHING_TIMEOUT':
                return this.finishingTimeout(action);
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

    private async finishingNode({ node }: { type: 'FINISHING'; node: Node }): Promise<Result<Node>> {
        if (!node.url) {
            return Err(new FleetError('fleet_node_url_not_found', { context: { nodeId: node.id } }));
        }

        try {
            const res = await retryWithBackoff(
                async () => {
                    return await fetch(`${node.url}/notifyWhenIdle`, { method: 'POST', body: JSON.stringify({ nodeId: node.id }) });
                },
                {
                    numOfAttempts: 5
                }
            );
            if (!res.ok) {
                throw new Error(`status: ${res.status}. response: ${res.statusText}`);
            }
        } catch (err) {
            logger.warning(`Failed to notify node ${node.id} to notifyWhenIdle: ${err}`);
        }

        return nodes.transitionTo(this.dbClient.db, {
            nodeId: node.id,
            newState: 'FINISHING'
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

    private async finishingTimeout({ node }: { type: 'FINISHING_TIMEOUT'; node: Node }): Promise<Result<Node>> {
        // Locally we assume the node is IDLE
        // since the process is likely already killed
        // and the node is not able to notify back that it is idle
        if (envs.RUNNER_TYPE === 'LOCAL') {
            return nodes.transitionTo(this.dbClient.db, {
                nodeId: node.id,
                newState: 'IDLE'
            });
        }
        // TODO: find a better way to warn and alert
        logger.warning('Node is taking too long to finish:', node);
        return Promise.resolve(Ok(node));
    }

    public async createNodeForCurrentDeployment(routingId: Node['routingId']): Promise<Result<Node>> {
        const deployment = await deployments.getActive(this.dbClient.db);
        if (deployment.isErr()) {
            return Err(deployment.error);
        }
        if (!deployment.value) {
            return Err(new FleetError('no_active_deployment'));
        }
        return this.createNode({ type: 'CREATE', routingId, deployment: deployment.value });
    }
}
