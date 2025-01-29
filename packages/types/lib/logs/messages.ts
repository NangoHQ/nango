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
 * Error code attached to the message
 * Not used yet
 */
export type MessageCode = 'success';

/**
 * State of the Operation
 */
export type MessageState = 'waiting' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

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
    action: 'incoming' | 'forward' | 'sync';
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

/**
 * Full schema
 */
export interface MessageRow {
    id: string;

    // State
    source: 'internal' | 'user';
    level: LogLevel;
    type: MessageType;
    message: string;
    title: string | null;
    state: MessageState;
    code: MessageCode | null;
    operation: null;

    // Ids
    accountId: number | null;
    accountName: string | null;

    environmentId: number | null;
    environmentName: string | null;

    /**
     * Provider name, i.e: github
     */
    providerName: string | null;
    /**
     * Database ID of the config, i.e: 9
     */
    integrationId: number | null;
    /**
     * Unique config name, i.e: github-demo
     */
    integrationName: string | null;

    connectionId: number | null;
    connectionName: string | null;

    syncConfigId: number | null;
    syncConfigName: string | null;

    jobId: string | null;

    userId: number | null;

    parentId: string | null;

    // Associated meta
    error: { name: string; message: string; type?: string | null; payload?: any } | null;
    request: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body?: unknown;
    } | null;
    response: {
        code: number;
        headers: Record<string, string>;
        body?: unknown;
    } | null;
    meta: MessageMeta | null;

    // Dates
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    expiresAt: string | null;
}

/**
 * What is required to insert a Message
 */
export type OperationRowInsert = Omit<Merge<Partial<MessageRow>, { operation: OperationList }>, 'message'>;
export type OperationRow = Merge<Required<OperationRowInsert>, { message: string; accountId: number; accountName: string }>;

/**
 * What is required to insert a Message
 */
export type MessageRowInsert = Pick<MessageRow, 'type' | 'message'> & Partial<Omit<MessageRow, 'type' | 'message'>> & { id?: never };

export type MessageOrOperationRow = MessageRow | OperationRow;
