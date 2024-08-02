import type { DatabaseClient } from '@nangohq/scheduler';
import { Scheduler, getTestDbClient } from '@nangohq/scheduler';
import { EventsHandler } from './events.js';
import { OrchestratorClient } from './clients/client.js';
import { getServer } from './server.js';

export class TestOrchestratorService {
    private orchestratorClient: OrchestratorClient;
    private port: number;
    private dbClient: DatabaseClient;
    private scheduler: Scheduler | null;
    private eventsHandler: EventsHandler;

    constructor({ port }: { port: number }) {
        this.dbClient = getTestDbClient();
        this.eventsHandler = new EventsHandler({
            CREATED: () => {},
            STARTED: () => {},
            SUCCEEDED: () => {},
            FAILED: () => {},
            EXPIRED: () => {},
            CANCELLED: () => {}
        });
        this.port = port;
        this.scheduler = null;
        this.orchestratorClient = new OrchestratorClient({ baseUrl: `http://localhost:${port}` });
    }

    async start() {
        await this.dbClient.migrate();
        this.scheduler = new Scheduler({
            dbClient: this.dbClient,
            on: this.eventsHandler.onCallbacks
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
