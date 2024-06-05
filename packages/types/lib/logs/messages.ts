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
export interface MessageOpSync {
    type: 'sync';
    action: 'pause' | 'unpause' | 'run' | 'request_run' | 'request_run_full' | 'cancel' | 'init';
}
export interface MessageOpProxy {
    type: 'proxy';
}
export interface MessageOpAction {
    type: 'action';
}
export interface MessageOpAuth {
    type: 'auth';
    action: 'create_connection' | 'refresh_token' | 'post_connection';
}
export interface MessageOpAdmin {
    type: 'admin';
    action: 'impersonation';
}
export interface MessageOpWebhook {
    type: 'webhook';
    action: 'incoming' | 'outgoing';
}
export interface MessageOpDeploy {
    type: 'deploy';
    action: 'prebuilt' | 'custom';
}
export type MessageOperation = MessageOpSync | MessageOpProxy | MessageOpAction | MessageOpWebhook | MessageOpDeploy | MessageOpAuth | MessageOpAdmin;

/**
 * Full schema
 */
export type MessageRow = {
    id: string;

    // State
    source: 'internal' | 'user';
    level: LogLevel;
    type: MessageType;
    message: string;
    title: string | null;
    state: MessageState;
    code: MessageCode | null;

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
    error: { name: string; message: string } | null;
    request: {
        url: string;
        method: string;
        headers: Record<string, string>;
    } | null;
    response: {
        code: number;
        headers: Record<string, string>;
    } | null;
    meta: MessageMeta | null;

    // Dates
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    expiresAt: string | null;
} & { operation: MessageOperation | null };

/**
 * What is required to insert a Message
 */
export type OperationRequired = 'operation' | 'message';
export type OperationRowInsert = Pick<MessageRow, OperationRequired> & Partial<Omit<MessageRow, OperationRequired>>;
export type OperationRow = Pick<MessageRow, OperationRequired> & Omit<MessageRow, OperationRequired>;

/**
 * What is required to insert a Message
 */
export type MessageRowInsert = Pick<MessageRow, 'type' | 'message'> & Partial<Omit<MessageRow, 'type' | 'message'>> & { id?: string | undefined };

export type LogsBuffer = Pick<MessageRow, 'level' | 'message' | 'createdAt'> & Partial<Pick<MessageRow, 'error' | 'meta'>>;
