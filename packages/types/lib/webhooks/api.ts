import type { AuthOperationType, AuthModeType } from '../auth/api.js';
import type { SyncResult, SyncType } from '../scripts/syncs/api.js';
import type { ErrorPayload } from '../api.js';

export type WebhookTypes = 'sync' | 'auth' | 'forward';

export interface NangoSyncWebhookBody {
    from: string;
    type: 'sync';
    connectionId: string;
    providerConfigKey: string;
    syncName: string;
    model: string;
    syncType: SyncType;
}

export interface NangoSyncWebhookBodySuccess extends NangoSyncWebhookBody {
    modifiedAfter: string;
    responseResults: SyncResult;
    success: true;

    // legacy, use modifiedAfter instead
    queryTimeStamp: string | null;
}

export interface NangoSyncWebhookBodyError {
    success: false;
    error: ErrorPayload;
    startedAt: string;
    failedAt: string;
}

export interface NangoAuthWebhookBody {
    from: string;
    type: 'auth';
    connectionId: string;
    authMode: AuthModeType;
    providerConfigKey: string;
    provider: string;
    environment: string;
    operation: AuthOperationType;
}

export interface NangoAuthWebhookBodySuccess extends NangoAuthWebhookBody {
    success: true;
}

export interface NangoAuthWebhookBodyError extends NangoAuthWebhookBody {
    success: false;
    error: ErrorPayload;
}

export interface NangoForwardWebhookBody {
    from: string;
    type: WebhookTypes;
    connectionId?: string;
    providerConfigKey: string;
    payload: unknown;
}
