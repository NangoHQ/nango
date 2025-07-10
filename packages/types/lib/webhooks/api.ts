import type { AsyncActionResponse } from '../action/api.js';
import type { ErrorPayload } from '../api.js';
import type { AuthModeType, AuthOperationType } from '../auth/api.js';
import type { SyncResult } from '../scripts/syncs/api.js';

export type WebhookTypes = 'sync' | 'auth' | 'forward' | 'async_action';

export interface NangoWebhookBase {
    from: string;
    type: WebhookTypes;
}
export type NangoWebhookBody = NangoSyncWebhookBody | NangoAuthWebhookBody;

// -----
// Sync
// -----
export interface NangoSyncWebhookBodyBase extends NangoWebhookBase {
    type: 'sync';
    connectionId: string;
    providerConfigKey: string;
    syncName: string;
    syncVariant: string;
    model: string;
    syncType: 'INCREMENTAL' | 'INITIAL' | 'WEBHOOK';
}

export interface NangoSyncWebhookBodySuccess extends NangoSyncWebhookBodyBase {
    success: true;
    modifiedAfter: string;
    responseResults: SyncResult;
    /**
     * @deprecated legacy, use modifiedAfter instead
     */
    queryTimeStamp: string | null;
}

export interface NangoSyncWebhookBodyError extends NangoSyncWebhookBodyBase {
    success: false;
    error: ErrorPayload;
    startedAt: string;
    failedAt: string;
}
export type NangoSyncWebhookBody = NangoSyncWebhookBodySuccess | NangoSyncWebhookBodyError;

// -----
// Auth
// -----
export interface NangoAuthWebhookBodyBase extends NangoWebhookBase {
    type: 'auth';
    connectionId: string;
    authMode: AuthModeType;
    providerConfigKey: string;
    provider: string;
    environment: string;
    operation: AuthOperationType;
    /**
     * Only presents if the connection happened with a session token
     */
    endUser?: { endUserId: string; organizationId?: string | undefined } | undefined;
}

export interface NangoAuthWebhookBodySuccess extends NangoAuthWebhookBodyBase {
    success: true;
    type: 'auth';
}

export interface NangoAuthWebhookBodyError extends NangoAuthWebhookBodyBase {
    success: false;
    error: ErrorPayload;
    type: 'auth';
}

export type NangoAuthWebhookBody = NangoAuthWebhookBodySuccess | NangoAuthWebhookBodyError;

// -----
// Forward
// -----
export interface NangoForwardWebhookBody extends NangoWebhookBase {
    type: 'forward';
    connectionId?: string;
    providerConfigKey: string;
    payload: unknown;
}

// -----
// Async action
//
export interface NangoAsyncActionWebhookBody extends NangoWebhookBase {
    type: 'async_action';
    connectionId: string;
    providerConfigKey: string;
    payload: AsyncActionResponse;
}
