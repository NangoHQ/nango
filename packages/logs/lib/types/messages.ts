export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export type MessageMeta = Record<string, unknown> | null;

export type OperationType = 'sync' | 'log' | 'http' | 'proxy' | 'webhook_outgoing' | 'webhook_incoming';
export type OperationCode = 'success';

export type OperationState = 'waiting' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

export interface MessageBase {
    id: string;
    source: 'nango' | 'user';

    type: OperationType;
    level: LogLevel;
    message: string;
    meta: MessageMeta;
    title: string | null;
    state: OperationState;
    code: OperationCode | null;

    createdAt: string;
}

/**
 * An operation is a high level log, like a trace
 */
export type OperationRow = MessageBase & {
    accountId: string;
    accountName: string;

    environmentId: string | null;
    environmentName: string | null;

    configId: string | null;
    configName: string | null;

    connectionId: string | null;
    connectionName: string | null;

    syncId: string | null;
    syncName: string | null;

    jobId: string | null;

    userId: string | null;

    updatedAt: string;
    startedAt: string | null;
    endedAt: string | null;
};

/**
 * A message is a log inside an operation, like a span
 */
export type MessageRow = MessageBase & {
    level: LogLevel;
    parentId: string | null;

    error: Error | null;
    request: {
        url: string;
        headers: Record<string, string>;
    } | null;
    response: {
        code: number;
        headers: Record<string, string>;
    } | null;
};

export type OperationOrMessage = OperationRow | MessageRow;

/**
 * What is required to insert a Message
 */
export type OperationRowInsert = Pick<OperationRow, 'type' | 'message' | 'accountId' | 'accountName'> &
    Partial<Omit<OperationRow, 'type' | 'message' | 'accountId' | 'accountName'>>;

/**
 * What is required to insert a Message
 */
export type MessageRowInsert = Pick<MessageRow, 'type' | 'message'> & Partial<Omit<MessageRow, 'type' | 'message'>> & { id?: string | undefined };
