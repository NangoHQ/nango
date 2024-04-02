export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export type MessageMeta = Record<string, unknown> | null;

export type MessageType = 'sync' | 'log' | 'http' | 'proxy' | 'webhook_outgoing' | 'webhook_incoming';
export type MessageCode = 'success';
export type MessageState = 'waiting' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

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

    userId: string | null;

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
    meta: MessageMeta;

    // Dates
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    endedAt: string | null;
}

/**
 * What is required to insert a Message
 */
export type OperationRequired = 'type' | 'message' | 'accountId' | 'accountName';
export type OperationRowInsert = Pick<MessageRow, OperationRequired> & Partial<Omit<MessageRow, OperationRequired>>;

/**
 * What is required to insert a Message
 */
export type MessageRowInsert = Pick<MessageRow, 'type' | 'message'> & Partial<Omit<MessageRow, 'type' | 'message'>> & { id?: string | undefined };
