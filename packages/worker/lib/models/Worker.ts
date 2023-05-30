import type { Connection, NangoIntegrationData } from '@nangohq/shared';

export interface InitialSyncArgs {
    syncId: string;
    syncJobId: number;
    syncName: string;
    activityLogId: number;
    nangoConnection: NangoConnection;
}

export interface ContinuousSyncArgs {
    syncId: string;
    activityLogId: number;
    syncName: string;
    syncData: NangoIntegrationData;
    nangoConnection: NangoConnection;
}

export type NangoConnection = Pick<Connection, 'id' | 'connection_id' | 'provider_config_key' | 'account_id'>;
