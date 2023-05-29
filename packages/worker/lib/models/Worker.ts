import type { Connection, NangoIntegrationData } from '@nangohq/shared';

export interface InitialSyncArgs {
    syncId: number;
    activityLogId: number;
}

export interface ContinuousSyncArgs {
    nangoConnectionId: number;
    activityLogId: number;
    syncName: string;
    syncData: NangoIntegrationData;
}

export type NangoConnection = Pick<Connection, 'id' | 'connection_id' | 'provider_config_key' | 'account_id'>;
