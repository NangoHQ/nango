import type { LogLevel } from './global';

export type MsgMeta = Record<string, unknown> | null;

/**
 * Representation of a Message row from the DB
 */
export interface MessageRow {
    id: string;

    operationId: string;
    level: LogLevel;
    type: 'log' | 'http';
    source: 'nango' | 'user';
    message: string;

    error: Error | null;
    request: {
        url: string;
        headers: Record<string, string>;
    } | null;
    response: {
        code: number;
        headers: Record<string, string>;
    } | null;
    meta: MsgMeta;

    createdAt: string;
}

/**
 * Representation of what is required to insert a Message
 */
export type MessageRowInsert = Pick<MessageRow, 'type' | 'message'> &
    Partial<Pick<MessageRow, 'operationId' | 'meta' | 'createdAt' | 'source' | 'error' | 'level' | 'request' | 'response'>> & { id?: string | undefined };
