import { setTimeout } from 'node:timers/promises';

import { Err, Ok } from '@nangohq/utils';

import { DatabaseClient } from './db/client.js';
import { envs } from './env.js';
import { DockerImageVerifier } from './image-verifier/docker/verifier.js';
import { ECRImageVerifier } from './image-verifier/ecr/verifier.js';
import * as deployments from './models/deployments.js';
import * as nodeConfigOverrides from './models/node_config_overrides.js';
import * as nodes from './models/nodes.js';
import { noopNodeProvider } from './node-providers/noop.js';
import { Supervisor } from './supervisor/supervisor.js';
import { FleetError } from './utils/errors.js';
import { withPgLock } from './utils/locking.js';

import type { ImageVerifier } from './image-verifier/verifier.js';
import type { NodeProvider } from './node-providers/node_provider.js';
import type { Node, NodeConfigOverride } from './types.js';
import type { Deployment, ImageType, RoutingId } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type knex from 'knex';

const defaultDbUrl =
    envs.RUNNERS_DATABASE_URL ||
    envs.NANGO_DATABASE_URL ||
    `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}?application_name=${envs.NANGO_DB_APPLICATION_NAME}${envs.NANGO_DB_SSL ? '&sslmode=no-verify' : ''}`;

export class Fleet {
    public fleetId: string;
    private dbClient: DatabaseClient;
    private supervisor: Supervisor | undefined = undefined;
    private nodeProvider: NodeProvider;
    private imageVerifiers = new Map<ImageType, ImageVerifier>();

    constructor({ fleetId, dbUrl = defaultDbUrl, nodeProvider }: { fleetId: string; dbUrl?: string | undefined; nodeProvider?: NodeProvider }) {
        this.fleetId = fleetId;
        this.dbClient = new DatabaseClient({ url: dbUrl, schema: fleetId });
        if (nodeProvider) {
            this.supervisor = new Supervisor({ dbClient: this.dbClient, nodeProvider: nodeProvider, fleetId: this.fleetId });
        }
        this.nodeProvider = nodeProvider || noopNodeProvider;
        this.imageVerifiers.set('docker', new DockerImageVerifier());
        this.imageVerifiers.set('ecr', new ECRImageVerifier());
    }

    public async migrate(): Promise<void> {
        await this.dbClient.migrate();
    }

    public start(): void {
        if (this.supervisor) {
            void this.supervisor.start();
        }
    }

    public async stop(): Promise<void> {
        if (this.supervisor) {
            await this.supervisor.stop();
        }
        await this.dbClient.destroy();
    }

    public async rollout(image: string, options?: { imageType?: ImageType; verifyImage?: boolean }): Promise<Result<Deployment>> {
        if (options?.verifyImage !== false) {
            const imageVerifier = this.imageVerifiers.get(options?.imageType || 'docker');
            if (!imageVerifier) {
                return Err(new FleetError('fleet_rollout_invalid_image_type', { context: { imageType: options?.imageType || 'docker' } }));
            }
            const verified = await imageVerifier.verify(image);
            if (verified.isErr()) {
                return Err(verified.error);
            }
        }

        return this.dbClient.db.transaction(async (trx) => {
            const deployment = await deployments.create(trx, image);
            if (deployment.isErr()) {
                throw deployment.error;
            }

            // rolling out cancels all nodeConfigOverrides images
            await nodeConfigOverrides.resetImage(trx);

            return deployment;
        });
    }

    public async getRunningNode(routingId: RoutingId): Promise<Result<Node>> {
        const searchNode = async (trx: knex.Knex): Promise<Result<Node | undefined>> => {
            const search = await nodes.search(trx, {
                states: ['PENDING', 'STARTING', 'RUNNING', 'OUTDATED'],
                routingId
            });
            if (search.isErr()) {
                return Err(search.error);
            }

            const byState = search.value.get(routingId);
            const node = byState?.RUNNING?.[0] || byState?.OUTDATED?.[0] || byState?.STARTING?.[0] || byState?.PENDING?.[0];
            return Ok(node);
        };

        const recurse = async (supervisor: Supervisor | undefined, start: Date): Promise<Result<Node>> => {
            if (!supervisor) {
                return Err(new FleetError('fleet_misconfigured', { context: { fleetId: this.fleetId } }));
            }
            if (new Date().getTime() - start.getTime() > envs.FLEET_TIMEOUT_GET_RUNNING_NODE_MS) {
                return Err(new FleetError('fleet_node_not_ready_timeout', { context: { routingId } }));
            }

            // search for existing node
            let node = await searchNode(this.dbClient.db);
            if (node.isErr()) {
                return Err(node.error);
            }

            // create node if it does not exist yet
            if (!node.value) {
                const createNode = await withPgLock({
                    db: this.dbClient.db,
                    lockKey: `fleet_${this.fleetId}_create_node_${routingId}`,
                    fn: async (trx): Promise<Result<Node>> => {
                        // double check node was not created while acquiring lock
                        const node = await searchNode(trx);
                        if (node.isErr()) {
                            return Err(node.error);
                        }
                        if (node.value) {
                            return Ok(node.value);
                        }

                        const deployment = await deployments.getActive(trx);
                        if (deployment.isErr()) {
                            return Err(deployment.error);
                        }
                        if (!deployment.value) {
                            return Err(new FleetError('no_active_deployment'));
                        }
                        return supervisor.createNode(trx, { type: 'CREATE', routingId, deployment: deployment.value });
                    },
                    timeoutMs: 10 * 1000
                });
                if (createNode.isErr()) {
                    return Err(createNode.error);
                }
                node = createNode;
            }

            // RUNNING or OUTDATED nodes are able to accept tasks
            if (node.value?.state === 'RUNNING' || node?.value?.state === 'OUTDATED') {
                return Ok(node.value);
            }

            // wait for node to be ready
            await setTimeout(envs.FLEET_RETRY_DELAY_GET_RUNNING_NODE_MS);
            return recurse(supervisor, start);
        };
        return recurse(this.supervisor, new Date());
    }

    public async registerNode({ nodeId, url }: { nodeId: number; url: string }): Promise<Result<Node>> {
        const valid = await this.nodeProvider.verifyUrl(url);
        if (valid.isErr()) {
            return Err(valid.error);
        }
        // in Render, network configuration can take a long time to be applied and accessible to other services
        // we therefore wait until the health url is reachable
        const healthy = await this.nodeProvider.waitUntilHealthy({ nodeId, url, timeoutMs: envs.FLEET_TIMEOUT_HEALTHY_MS });
        if (healthy.isErr()) {
            return Err(healthy.error);
        }
        return await nodes.register(this.dbClient.db, { nodeId, url });
    }

    public async idleNode({ nodeId }: { nodeId: number }): Promise<Result<Node>> {
        return nodes.idle(this.dbClient.db, { nodeId });
    }

    public async overrideNodeConfig(override: Omit<NodeConfigOverride, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<NodeConfigOverride>> {
        const defaultConfig = this.nodeProvider.defaultNodeConfig;
        return this.dbClient.db.transaction(async (trx) => {
            const search = await nodeConfigOverrides.search(trx, { routingIds: [override.routingId] });
            if (search.isErr()) {
                return Err(search.error);
            }
            const existing = search.value.get(override.routingId);

            const image = override.image ?? existing?.image;
            const isDefault =
                !image &&
                defaultConfig.cpuMilli === override.cpuMilli &&
                defaultConfig.memoryMb === override.memoryMb &&
                defaultConfig.storageMb === override.storageMb &&
                defaultConfig.isTracingEnabled === override.isTracingEnabled &&
                defaultConfig.isProfilingEnabled === override.isProfilingEnabled &&
                defaultConfig.idleMaxDurationMs === override.idleMaxDurationMs &&
                defaultConfig.executionTimeoutSecs === override.executionTimeoutSecs &&
                defaultConfig.provisionedConcurrency === override.provisionedConcurrency;

            if (isDefault) {
                return nodeConfigOverrides.remove(trx, override.routingId);
            }

            return nodeConfigOverrides.upsert(trx, override);
        });
    }
}
