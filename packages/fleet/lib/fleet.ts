import type { Result } from '@nangohq/utils';
import { DatabaseClient } from './db/client.js';
import * as deployments from './models/deployments.js';
import type { CommitHash, Deployment } from './types.js';

export class Fleet {
    private dbClient: DatabaseClient;
    constructor({ fleetId, dbUrl }: { fleetId: string; dbUrl: string }) {
        this.dbClient = new DatabaseClient({ url: dbUrl, schema: fleetId });
    }

    public async migrate(): Promise<void> {
        await this.dbClient.migrate();
    }

    public async deploy(commitId: CommitHash): Promise<Result<Deployment>> {
        return deployments.create(this.dbClient.db, commitId);
    }
}
