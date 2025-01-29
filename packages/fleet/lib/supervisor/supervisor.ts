import tracer from 'dd-trace';
import type { DatabaseClient } from '../db/client.js';
import type { Knex } from 'knex';
import { logger } from '../utils/logger.js';
import * as nodes from '../models/nodes.js';
import * as deployments from '../models/deployments.js';
import * as nodeConfigOverrides from '../models/node_config_overrides.js';
import { Err, errorToObject, Ok, retryWithBackoff } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { FleetError } from '../utils/errors.js';
import type { Node, NodeConfigOverride } from '../types.js';
import type { Deployment } from '@nangohq/types';
import { setTimeout } from 'node:timers/promises';
import type { NodeProvider } from '../node-providers/node_provider.js';
import { envs } from '../env.js';
import { withPgLock } from '../utils/locking.js';
import { Operation } from './operation.js';

type SupervisorState = 'stopped' | 'running' | 'stopping';

export const STATE_TIMEOUT_MS = {
    PENDING: envs.FLEET_TIMEOUT_PENDING_MS,
    STARTING: envs.FLEET_TIMEOUT_STARTING_MS,
    FINISHING: envs.FLEET_TIMEOUT_FINISHING_MS,
    IDLE: envs.FLEET_TIMEOUT_IDLE_MS,
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
    private tickCancelled: boolean = false;
    public nodeProvider: NodeProvider;

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
        return tracer.trace('fleet.supervisor.tick', async (span) => {
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
                span.setTag('error', err);
                return Err(new FleetError('supervisor_tick_failed', { cause: err }));
            } finally {
                await setTimeout(envs.FLEET_SUPERVISOR_WAIT_TICK_MS);
            }
        });
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
                fn: async () => this.tick(),
                timeoutMs: envs.FLEET_SUPERVISOR_TIMEOUT_TICK_MS,
                onTimeout: () => {
                    this.tickCancelled = true;
                    return Promise.resolve();
                }
            });
            if (res.isErr()) {
                await setTimeout(envs.FLEET_SUPERVISOR_RETRY_DELAY_MS);
                logger.warning('Fleet supervisor:', res.error.message, res.error.cause);
            }
        }
        this.state = 'stopped';
    }

    private async plan(cursor?: number): Promise<Result<Operation[]>> {
        const activeSpan = tracer.scope().active();
        return tracer.trace('fleet.supervisor.plan', { ...(activeSpan ? { childOf: activeSpan } : {}) }, async (span) => {
            const getDeployment = await deployments.getActive(this.dbClient.db);
            if (getDeployment.isErr()) {
                span?.setTag('error', getDeployment.error);
                return Err(getDeployment.error);
            }
            if (!getDeployment.value) {
                const err = new FleetError('no_active_deployment');
                span?.setTag('error', err);
                return Err(err);
            }
            const deployment = getDeployment.value;
            const plan: Operation[] = [];

            const search = await nodes.search(this.dbClient.db, {
                states: ['PENDING', 'STARTING', 'RUNNING', 'OUTDATED', 'FINISHING', 'IDLE', 'TERMINATED', 'ERROR'],
                ...(cursor ? { cursor } : {})
            });
            if (search.isErr()) {
                span?.setTag('error', search.error);
                return Err(search.error);
            }

            const routingIds = Array.from(search.value.nodes.keys());
            const configOverrides = await nodeConfigOverrides.search(this.dbClient.db, { routingIds });
            if (configOverrides.isErr()) {
                span?.setTag('error', configOverrides.error);
                return Err(configOverrides.error);
            }

            for (const [routingId, nodes] of search.value.nodes) {
                // Start pending nodes
                plan.push(...(nodes.PENDING || []).map<Operation>((node) => ({ type: 'START', node })));

                // Timeout PENDING nodes if they are taking too long (nodeProvider probably failed to create the node)
                plan.push(
                    ...(nodes.PENDING || []).flatMap<Operation>((node) => {
                        if (Date.now() - node.lastStateTransitionAt.getTime() > STATE_TIMEOUT_MS.PENDING) {
                            return [{ type: 'FAIL', node, reason: 'pending_timeout_reached' as const }];
                        }
                        return [];
                    })
                );

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
                // if new deployment is available
                // or if config overrides have changed
                const hasConfigOverride = (node: Node, configOverride: NodeConfigOverride | undefined): boolean => {
                    if (!configOverride) {
                        return false;
                    }
                    // image override might have a commitId
                    // so we need to check if the image override with commitId is the same as the node's image
                    // or if the image override (without commitId) + current deployment commitId is the same as the node's image
                    return !(
                        (configOverride.image === node.image || `${configOverride.image}:${deployment.commitId}` === node.image) &&
                        node.cpuMilli === configOverride.cpuMilli &&
                        node.memoryMb === configOverride.memoryMb &&
                        node.storageMb === configOverride.storageMb
                    );
                };
                plan.push(
                    ...(nodes.RUNNING || []).flatMap<Operation>((node) => {
                        const configOverride = configOverrides.value.get(node.routingId);
                        if (node.deploymentId !== deployment.id || hasConfigOverride(node, configOverride)) {
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

                // Timeout IDLE nodes if they are taking too long (nodeProvider probably failed to terminate the node)
                plan.push(
                    ...(nodes.IDLE || []).flatMap<Operation>((node) => {
                        if (Date.now() - node.lastStateTransitionAt.getTime() > STATE_TIMEOUT_MS.IDLE) {
                            return [{ type: 'FAIL', node, reason: 'idle_timeout_reached' as const }];
                        }
                        return [];
                    })
                );

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
        });
    }

    private async executePlan(plan: Operation[]): Promise<void> {
        const activeSpan = tracer.scope().active();
        return tracer.trace('fleet.supervisor.executePlan', { ...(activeSpan ? { childOf: activeSpan } : {}) }, async (executePlanSpan) => {
            for (const operation of plan) {
                if (this.tickCancelled) {
                    executePlanSpan?.setTag('error', 'tick_cancelled');
                    return;
                }
                await tracer.trace(
                    `fleet.supervisor.operation.${operation.type.toLowerCase()}`,
                    { tags: Operation.asSpanTags(operation) },
                    async (operationSpan) => {
                        const result = await this.execute(operation);
                        if (result.isErr()) {
                            operationSpan?.setTag('error', result.error);
                            logger.error('Failed to execute operation:', result.error, errorToObject(result.error.cause));
                        }
                    }
                );
            }
        });
    }

    private async execute(operation: Operation): Promise<Result<Node>> {
        switch (operation.type) {
            case 'CREATE':
                return this.createNode(this.dbClient.db, operation);
            case 'START':
                return this.startNode(operation);
            case 'OUTDATE':
                return this.outdateNode(operation);
            case 'FINISHING':
                return this.finishingNode(operation);
            case 'TERMINATE':
                return this.terminateNode(operation);
            case 'REMOVE':
                return this.removeNode(operation);
            case 'FINISHING_TIMEOUT':
                return this.finishingTimeout(operation);
            case 'FAIL':
                return this.failNode(operation);
        }
    }

    public async createNode(
        db: Knex,
        {
            routingId,
            deployment
        }: {
            type: 'CREATE';
            routingId: Node['routingId'];
            deployment: Deployment;
        }
    ): Promise<Result<Node>> {
        let newNodeConfig = this.nodeProvider.defaultNodeConfig;

        const nodeConfigOverride = await nodeConfigOverrides.search(db, { routingIds: [routingId] });
        if (nodeConfigOverride.isErr()) {
            return Err(nodeConfigOverride.error);
        }
        const nodeConfigOverrideValue = nodeConfigOverride.value.get(routingId);
        if (nodeConfigOverrideValue) {
            newNodeConfig = nodeConfigOverrideValue;
        }

        return nodes.create(db, {
            routingId,
            deploymentId: deployment.id,
            image: newNodeConfig.image.includes(':') ? newNodeConfig.image : `${newNodeConfig.image}:${deployment.commitId}`,
            cpuMilli: newNodeConfig.cpuMilli,
            memoryMb: newNodeConfig.memoryMb,
            storageMb: newNodeConfig.storageMb
        });
    }

    private async startNode({ node }: { type: 'START'; node: Node }): Promise<Result<Node>> {
        const res = await this.nodeProvider.start(node);
        if (res.isErr()) {
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
            logger.warning(`Failed to notify node ${node.id} to notifyWhenIdle`, err);
        }

        return nodes.transitionTo(this.dbClient.db, {
            nodeId: node.id,
            newState: 'FINISHING'
        });
    }

    private async terminateNode({ node }: { type: 'TERMINATE'; node: Node }): Promise<Result<Node>> {
        const res = await this.nodeProvider.terminate(node);
        if (res.isErr()) {
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
}
