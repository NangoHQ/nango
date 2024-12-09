import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { DatabaseClient } from './db/client.js';
import * as deployments from './models/deployments.js';
import * as nodes from './models/nodes.js';
import type { CommitHash, Deployment, Node, RoutingId } from './types.js';
import { FleetError } from './utils/errors.js';
import { setTimeout } from 'node:timers/promises';
import { Supervisor } from './supervisor.js';
import type { NodeProvider } from './node-providers/node_provider.js';
import type { FleetId } from './instances.js';
import { noopNodeProvider } from './node-providers/noop.js';
import { envs } from './env.js';

const defaultDbUrl =
    envs.NANGO_DATABASE_URL ||
    `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}`;

export class Fleet {
    private dbClient: DatabaseClient;
    private supervisor: Supervisor;
    private nodeProvider: NodeProvider;
    constructor({
        fleetId,
        dbUrl = defaultDbUrl,
        nodeProvider = noopNodeProvider
    }: {
        fleetId: FleetId;
        dbUrl?: string | undefined;
        nodeProvider?: NodeProvider | undefined;
    }) {
        this.dbClient = new DatabaseClient({ url: dbUrl, schema: fleetId });
        this.nodeProvider = nodeProvider;
        this.supervisor = new Supervisor({ dbClient: this.dbClient, nodeProvider });
    }

    public async migrate(): Promise<void> {
        await this.dbClient.migrate();
    }

    public start(): void {
        void this.supervisor.start();
    }

    public async stop(): Promise<void> {
        await this.supervisor.stop();
    }

    public async deploy(commitId: CommitHash): Promise<Result<Deployment>> {
        return deployments.create(this.dbClient.db, commitId);
    }

    public async getRunningNode(routingId: RoutingId): Promise<Result<Node>> {
        const recurse = async (start: Date): Promise<Result<Node>> => {
            if (new Date().getTime() - start.getTime() > envs.FLEET_TIMEOUT_GET_RUNNING_NODE) {
                return Err(new FleetError('fleet_node_not_ready_timeout', { context: { routingId } }));
            }
            const search = await nodes.search(this.dbClient.db, {
                states: ['PENDING', 'STARTING', 'RUNNING'],
                routingId
            });
            if (search.isErr()) {
                return Err(search.error);
            }
            const running = search.value.nodes.get(routingId)?.RUNNING[0];
            if (running) {
                return Ok(running);
            }
            const starting = search.value.nodes.get(routingId)?.STARTING[0];
            const pending = search.value.nodes.get(routingId)?.PENDING[0];

            if (!starting && !pending) {
                await this.supervisor.createNodeForCurrentDeployment(routingId);
            }

            // wait for node to be ready
            await setTimeout(1000);
            return recurse(start);
        };
        return recurse(new Date());
    }

    public async registerNode({ nodeId, url }: { nodeId: number; url: string }): Promise<Result<Node>> {
        const valid = await this.nodeProvider.verifyUrl(url);
        if (valid.isErr()) {
            return Err(valid.error);
        }
        return await nodes.register(this.dbClient.db, { nodeId, url });
    }

    public async idleNode({ nodeId }: { nodeId: number }): Promise<Result<Node>> {
        return nodes.idle(this.dbClient.db, { nodeId });
    }
}
