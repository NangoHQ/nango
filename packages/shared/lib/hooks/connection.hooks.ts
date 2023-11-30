import SyncClient from '../clients/sync.client.js';

export const connectionCreated = async (connectionId: number): Promise<void> => {
    const syncClient = await SyncClient.getInstance();
    syncClient?.initiate(connectionId);
};
