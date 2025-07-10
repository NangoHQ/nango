import { Scheduler, getTestDbClient } from '@nangohq/scheduler';

import { OrchestratorClient } from './clients/client.js';
import { TaskEventsHandler } from './events.js';
import { getServer } from './server.js';

import type { DatabaseClient } from '@nangohq/scheduler';

export class TestOrchestratorService {
    private orchestratorClient: OrchestratorClient;
    private port: number;
    private dbClient: DatabaseClient;
    private scheduler: Scheduler | null;
    private eventsHandler: TaskEventsHandler;

    constructor({ port }: { port: number }) {
        this.dbClient = getTestDbClient();
        this.eventsHandler = new TaskEventsHandler(this.dbClient.db, {
            on: {
                CREATED: () => {},
                STARTED: () => {},
                SUCCEEDED: () => {},
                FAILED: () => {},
                EXPIRED: () => {},
                CANCELLED: () => {}
            }
        });
        this.port = port;
        this.scheduler = null;
        this.orchestratorClient = new OrchestratorClient({ baseUrl: `http://localhost:${port}` });
    }

    async start() {
        await this.dbClient.migrate();
        this.scheduler = new Scheduler({
            db: this.dbClient.db,
            on: this.eventsHandler.onCallbacks,
            onError: () => {}
        });
        const server = getServer(this.scheduler, this.eventsHandler);
        server.listen(this.port);
    }

    async stop() {
        this.scheduler?.stop();
        await this.dbClient.clearDatabase();
    }

    getClient() {
        return this.orchestratorClient;
    }
}
