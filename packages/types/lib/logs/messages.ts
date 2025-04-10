import type { Merge } from 'type-fest';

/**
 * Level of the log and operation
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Free form JSON (not indexed)
 */
export type MessageMeta = Record<any, any>;

/**
 * Kind of messages
 * - log: classic string message
 * - http: an HTTP request with request/response added to the log
 */
export type MessageType = 'log' | 'http';

/**
 * State of the Operation
 */
export type OperationState = 'waiting' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

/**
 * Operations
 */
export interface OperationSync {
    type: 'sync';
    action: 'pause' | 'unpause' | 'run' | 'request_run' | 'request_run_full' | 'cancel' | 'init';
}
export interface OperationProxy {
    type: 'proxy';
    action: 'call';
}
export interface OperationAction {
    type: 'action';
    action: 'run';
}

export interface OperationOnEvents {
    type: 'events';
    action: 'post_connection_creation' | 'pre_connection_deletion';
}

// TODO: rename to OperationConnection
export interface OperationAuth {
    type: 'auth';
    action: 'create_connection' | 'refresh_token' | 'post_connection' | 'connection_test';
}
export interface OperationAdmin {
    type: 'admin';
    action: 'impersonation';
}
export interface OperationWebhook {
    type: 'webhook';
    action: 'incoming' | 'forward' | 'sync' | 'connection_create' | 'connection_refresh';
}

export interface OperationDeploy {
    type: 'deploy';
    action: 'prebuilt' | 'custom';
}
export type OperationList =
    | OperationSync
    | OperationProxy
    | OperationAction
    | OperationWebhook
    | OperationOnEvents
    | OperationDeploy
    | OperationAuth
    | OperationAdmin;
export interface MessageError {
    name: string;
    message: string;
    type?: string | undefined;
    payload?: any;
}
export interface MessageHTTPRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
}
export interface MessageHTTPResponse {
    code: number;
    headers: Record<string, string>;
}
export interface MessageHTTPRetry {
    attempt: number;
    max: number;
    waited: number;
}

/**
 * Full schema
 */
export interface MessageRow {
    /**
     * This ID is for debugging purpose, not for insertion
     * It should never be used to index
     */
    id: string;

    // State
    source: 'internal' | 'user';
    level: LogLevel;
    type: MessageType;
    message: string;
    context?: 'script' | 'proxy' | 'webhook' | 'auth' | undefined;

    // Operation row id
    parentId: string;

    // Associated meta
    error?: MessageError | undefined;
    request?: MessageHTTPRequest | undefined;
    response?: MessageHTTPResponse | undefined;
    meta?: MessageMeta | null | undefined;
    persistResults?:
        | {
              model: string;
              added: number;
              addedKeys: string[];
              updated: number;
              updatedKeys: string[];
              deleted: number;
              deleteKeys: string[];
          }
        | undefined;
    retry?: MessageHTTPRetry | undefined;

    // Dates
    createdAt: string;
    endedAt?: string | undefined;
    durationMs?: number | undefined;
}

export interface OperationRow {
    id: string;

    // State
    source: 'internal';
    level: LogLevel;
    type: 'operation';
    message: string;
    operation: OperationList;
    state: OperationState;

    // Ids
    accountId: number;
    accountName: string;

    environmentId?: number | undefined;
    environmentName?: string | undefined;

    /**
     * Provider name, i.e: github
     */
    providerName?: string | undefined;
    /**
     * Database ID of the config, i.e: 9
     */
    integrationId?: number | undefined;
    /**
     * Unique config name, i.e: github-demo
     */
    integrationName?: string | undefined;

    connectionId?: number | undefined;
    connectionName?: string | undefined;
    endUserId?: string | undefined;
    endUserName?: string | undefined;

    syncConfigId?: number | undefined;
    syncConfigName?: string | undefined;

    jobId?: string | undefined;

    userId?: number | undefined;

    // Associated meta
    error?: MessageError | undefined;
    request?: MessageHTTPRequest | undefined;
    response?: MessageHTTPResponse | undefined;
    meta?: MessageMeta | undefined;

    // Dates
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    expiresAt: string | null;
    durationMs?: number | undefined;
}

/**
 * What is required to insert an Operation
 */
export type OperationRowInsert = Merge<Partial<OperationRow>, Pick<OperationRow, 'operation'>>;

/**
 * What is required to insert a Message
 */
export type MessageRowInsert = Pick<MessageRow, 'type' | 'message' | 'createdAt' | 'level'> &
    Partial<Omit<MessageRow, 'type' | 'message' | 'meta_search'>> & { id?: never };

export type MessageOrOperationRow = MessageRow | OperationRow;
