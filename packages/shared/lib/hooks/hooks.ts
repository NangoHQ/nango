import SyncClient from '../clients/sync.client.js';
import type { RecentlyCreatedConnection } from '../models/Connection.js';
import integrationPostConnectionScript from '../integrations/scripts/connection/connection.manager.js';
import webhookService from '../services/notification/webhook.service.js';
import { isCloud, isLocal, isEnterprise } from '../utils/utils.js';

export const connectionCreated = async (
    connection: RecentlyCreatedConnection,
    provider: string,
    activityLogId: number | null,
    options: { initiateSync?: boolean; runPostConnectionScript?: boolean } = { initiateSync: true, runPostConnectionScript: true }
): Promise<void> => {
    const hosted = !isCloud() && !isLocal() && !isEnterprise();

    if (options.initiateSync === true && !hosted) {
        const syncClient = await SyncClient.getInstance();
        syncClient?.initiate(connection.id as number);
    }

    if (options.runPostConnectionScript === true) {
        integrationPostConnectionScript(connection, provider);
    }

    await webhookService.sendAuthUpdate(connection, provider, true, activityLogId);
};

export const connectionCreationFailed = async (connection: RecentlyCreatedConnection, provider: string, activityLogId: number | null): Promise<void> => {
    await webhookService.sendAuthUpdate(connection, provider, false, activityLogId);
};
