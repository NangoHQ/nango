import SyncClient from '../clients/sync.client.js';
import type { RecentlyCreatedConnection } from '../models/Connection.js';
import integrationPostConnectionScript from '../integrations/scripts/connection/connection.manager.js';

export const connectionCreated = async (connection: RecentlyCreatedConnection, provider: string, initiateSync = true): Promise<void> => {
    if (initiateSync) {
        const syncClient = await SyncClient.getInstance();
        syncClient?.initiate(connection.id as number);
    }

    integrationPostConnectionScript(connection, provider);
};
