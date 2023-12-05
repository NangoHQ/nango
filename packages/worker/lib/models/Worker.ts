import type { NangoConnection, NangoIntegrationData } from '@nangohq/shared';

export interface InitialSyncArgs {
    syncId: string;
    syncJobId: number;
    syncName: string;
    activityLogId: number;
    nangoConnection: NangoConnection;
    debug?: boolean;
}

export interface ContinuousSyncArgs {
    syncId: string;
    activityLogId: number;
    syncName: string;
    syncData: NangoIntegrationData;
    nangoConnection: NangoConnection;
    debug?: boolean;
}

export interface ActionArgs {
    input: object;
    actionName: string;
    nangoConnection: NangoConnection;
    activityLogId: number;
}

export interface WebhookArgs {
    name: string;
    parentSyncName: string;
    nangoConnection: NangoConnection;
    input: object;
    activityLogId: number;
}
