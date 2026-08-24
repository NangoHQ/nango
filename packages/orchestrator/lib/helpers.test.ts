import { InMemorySlidingWindowRateLimiter } from '@nangohq/kvstore';
import { getTestDbClient, Scheduler } from '@nangohq/scheduler';

import { OrchestratorClient } from './clients/client.js';
import { TaskEventsHandler } from './events.js';
import { handleSchedulerEvent } from './scheduler-config.js';
import { getServer } from './server.js';

import type { DatabaseClient } from '@nangohq/scheduler';

export class TestOrchestratorService {
    private orchestratorClient: OrchestratorClient;
    private port: number;
    private dbClient: DatabaseClient;
    private scheduler: Scheduler | null;
    private eventsHandler: TaskEventsHandler;
    private immediateRateLimiter: InMemorySlidingWindowRateLimiter;

    constructor({ port, schema }: { port: number; schema: string }) {
        this.dbClient = getTestDbClient(schema);
        this.eventsHandler = new TaskEventsHandler(this.dbClient.db);
        this.port = port;
        this.scheduler = null;
        this.immediateRateLimiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: schema, limit: 1_000_000, windowMs: 60_000 });
        this.orchestratorClient = new OrchestratorClient({ baseUrl: `http://localhost:${port}` });
    }

    async start() {
        await this.dbClient.migrate();
        this.scheduler = new Scheduler({
            db: this.dbClient.db,
            on: this.eventsHandler.onCallbacks,
            onError: () => {},
            onEvent: handleSchedulerEvent
        });
        const server = getServer(this.scheduler, this.eventsHandler, this.immediateRateLimiter);
        server.listen(this.port);
    }

    async stop() {
        this.scheduler?.stop();
        await this.immediateRateLimiter.destroy();
        await this.dbClient.clearDatabase();
    }

    getClient() {
        return this.orchestratorClient;
    }
}
