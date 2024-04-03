export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export type MessageMeta = Record<any, any>;

export type MessageType = 'log' | 'http';
export type MessageCode = 'success';
export type MessageState = 'waiting' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

/**
 * Operations
 */
export interface MessageOpSync {
    type: 'sync';
    action: 'pause' | 'unpause' | 'run' | 'run_full' | 'cancel';
}
export interface MessageOpProxy {
    type: 'proxy';
}
export interface MessageOpAction {
    type: 'action';
}
export interface MessageOpAuth {
    type: 'auth';
}
export interface MessageOpWebhook {
    type: 'webhook';
    action: 'incoming' | 'outgoing';
}
export interface MessageOpDeploy {
    type: 'deploy';
    action: 'prebuilt';
}
export type MessageOperation = MessageOpSync | MessageOpProxy | MessageOpAction | MessageOpWebhook | MessageOpDeploy | MessageOpAuth;

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

    configId: string | null;
    configName: string | null;

    connectionId: string | null;
    connectionName: string | null;

    syncId: string | null;
    syncName: string | null;

    jobId: string | null;

    userId: number | null;

    parentId: string | null;

    // Associated meta
    error: Error | null;
    request: {
        url: string;
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
} & { operation: MessageOperation | null };

/**
 * What is required to insert a Message
 */
export type OperationRequired = 'operation' | 'message';
export type OperationRowInsert = Pick<MessageRow, OperationRequired> & Partial<Omit<MessageRow, OperationRequired>>;

/**
 * What is required to insert a Message
 */
export type MessageRowInsert = Pick<MessageRow, 'type' | 'message'> & Partial<Omit<MessageRow, 'type' | 'message'>> & { id?: string | undefined };
