import type { AuthModeType, AuthOperationType } from '@nangohq/types';
import type { SyncResult, SyncType } from './Sync.js';
import type { FailedConnectionError } from './Connection.js';

export enum WebhookType {
    SYNC = 'sync',
    AUTH = 'auth',
    FORWARD = 'forward'
}

export interface NangoSyncWebhookBody {
    from: string;
    type: WebhookType.SYNC;
    connectionId: string;
    providerConfigKey: string;
    syncName: string;
    model: string;
    responseResults: SyncResult;
    syncType: SyncType;
    modifiedAfter: string;
    queryTimeStamp: string | null;
}

export interface NangoAuthWebhookBody {
    from: string;
    type: WebhookType.AUTH;
    connectionId: string;
    authMode: AuthModeType;
    providerConfigKey: string;
    provider: string;
    environment: string;
    success: boolean;
    operation: AuthOperationType;
    error?: FailedConnectionError;
}

export interface NangoForwardWebhookBody {
    from: string;
    type: WebhookType.FORWARD;
    connectionId?: string;
    providerConfigKey: string;
    payload: any;
}
