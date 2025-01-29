import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { DatabaseClient } from './db/client.js';
import * as deployments from './models/deployments.js';
import * as nodes from './models/nodes.js';
import * as nodeConfigOverrides from './models/node_config_overrides.js';
import type { Node } from './types.js';
import type { CommitHash, Deployment, RoutingId } from '@nangohq/types';
import { FleetError } from './utils/errors.js';
import { setTimeout } from 'node:timers/promises';
import { Supervisor } from './supervisor/supervisor.js';
import type { NodeProvider } from './node-providers/node_provider.js';
import type { FleetId } from './instances.js';
import { envs } from './env.js';
import { withPgLock } from './utils/locking.js';
import { noopNodeProvider } from './node-providers/noop.js';
import { waithUntilHealthy } from './utils/url.js';

const defaultDbUrl =
    envs.NANGO_DATABASE_URL ||
    `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}?application_name=${envs.NANGO_DB_APPLICATION_NAME}${envs.NANGO_DB_SSL ? '&sslmode=no-verify' : ''}`;

export class Fleet {
    public fleetId: string;
    private dbClient: DatabaseClient;
    private supervisor: Supervisor | undefined = undefined;
    private nodeProvider: NodeProvider;

    constructor({
        fleetId,
        dbUrl = defaultDbUrl,
        nodeProvider = noopNodeProvider
    }: {
        fleetId: FleetId;
        dbUrl?: string | undefined;
        nodeProvider?: NodeProvider;
    }) {
        this.fleetId = fleetId;
        this.dbClient = new DatabaseClient({ url: dbUrl, schema: fleetId });
        this.supervisor = new Supervisor({ dbClient: this.dbClient, nodeProvider: nodeProvider });
        this.nodeProvider = nodeProvider;
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
    }

    public async rollout(commitId: CommitHash): Promise<Result<Deployment>> {
        return this.dbClient.db.transaction(async (trx) => {
            const deployment = await deployments.create(trx, commitId);
            if (deployment.isErr()) {
                throw deployment.error;
            }

            // rolling out cancels all nodeConfigOverrides images
            await nodeConfigOverrides.resetImage(trx, { image: this.nodeProvider.defaultNodeConfig.image });

            return deployment;
        });
    }

    public async getRunningNode(routingId: RoutingId): Promise<Result<Node>> {
        const recurse = async (supervisor: Supervisor | undefined, start: Date): Promise<Result<Node>> => {
            if (!supervisor) {
                return Err(new FleetError('fleet_misconfigured', { context: { fleetId: this.fleetId } }));
            }
            if (new Date().getTime() - start.getTime() > envs.FLEET_TIMEOUT_GET_RUNNING_NODE_MS) {
                return Err(new FleetError('fleet_node_not_ready_timeout', { context: { routingId } }));
            }
            const search = await nodes.search(this.dbClient.db, {
                states: ['PENDING', 'STARTING', 'RUNNING', 'OUTDATED'],
                routingId
            });
            if (search.isErr()) {
                return Err(search.error);
            }
            const running = search.value.nodes.get(routingId)?.RUNNING || [];
            if (running[0]) {
                return Ok(running[0]);
            }
            const outdated = search.value.nodes.get(routingId)?.OUTDATED || [];
            if (outdated[0]) {
                return Ok(outdated[0]);
            }
            const starting = search.value.nodes.get(routingId)?.STARTING || [];
            const pending = search.value.nodes.get(routingId)?.PENDING || [];

            if (!starting[0] && !pending[0]) {
                await withPgLock({
                    db: this.dbClient.db,
                    lockKey: `create_node_${routingId}`,
                    fn: async (trx): Promise<Result<Node>> => {
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
        const healthy = await waithUntilHealthy({ url: `${url}/health`, timeoutMs: envs.FLEET_TIMEOUT_HEALTHY_MS });
        if (healthy.isErr()) {
            return Err(healthy.error);
        }
        return await nodes.register(this.dbClient.db, { nodeId, url });
    }

    public async idleNode({ nodeId }: { nodeId: number }): Promise<Result<Node>> {
        return nodes.idle(this.dbClient.db, { nodeId });
    }
}
