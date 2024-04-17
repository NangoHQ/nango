import type { MessageRow, MessageRowInsert, MessageMeta, OperationRowInsert } from './types/messages.js';
import { setRunning, createMessage, setFailed, setCancelled, setTimeouted, setSuccess, update } from './models/messages.js';
import type { FormatMessageData } from './models/helpers.js';
import { getFormattedMessage } from './models/helpers.js';
import type { SetRequired } from 'type-fest';
import { errorToObject } from '@nangohq/utils';
import { logger } from './utils.js';

export class LogContext {
    id: string;
    dryRun: boolean;
    logToConsole: boolean;

    constructor(data: { parentId: string }, options: { dryRun: boolean; logToConsole: boolean } = { dryRun: false, logToConsole: true }) {
        this.id = data.parentId;
        this.dryRun = options.dryRun;
        this.logToConsole = options.logToConsole;
    }

    async enrichOperation(data: Partial<MessageRow>): Promise<void> {
        await update({ id: this.id, data });
    }

    /**
     * ------ Logs
     */
    async log(data: MessageRowInsert): Promise<void> {
        await createMessage(getFormattedMessage({ ...data, parentId: this.id }));
    }

    async debug(message: string, meta: MessageMeta | null = null): Promise<void> {
        await this.log({ type: 'log', level: 'debug', message, meta, source: 'internal' });
    }

    async info(message: string, meta: MessageMeta | null = null): Promise<void> {
        await this.log({ type: 'log', level: 'info', message, meta, source: 'internal' });
    }

    async warn(message: string, meta: MessageMeta | null = null): Promise<void> {
        await this.log({ type: 'log', level: 'warn', message, meta, source: 'internal' });
    }

    async error(message: string, meta: (MessageMeta & { error?: unknown }) | null = null): Promise<void> {
        const { error, ...rest } = meta || {};
        const err = error ? { name: 'Unknown Error', message: 'unknown error', ...errorToObject(error) } : null;
        await this.log({ type: 'log', level: 'error', message, error: err ? { name: err.name, message: err?.message } : null, meta: rest, source: 'internal' });
    }

    async trace(message: string, meta: MessageMeta | null = null): Promise<void> {
        await this.log({ type: 'log', level: 'trace', message, meta, source: 'internal' });
    }

    async http(message: string, data: Pick<MessageRow, 'request' | 'response' | 'meta'>): Promise<void> {
        const level: MessageRow['level'] = data.response && data.response.code >= 400 ? 'error' : 'info';
        await this.log({ type: 'http', level, message, ...data, source: 'internal' });
    }

    /**
     * ------ State
     */
    async start(): Promise<void> {
        await setRunning({ id: this.id });
    }

    async failed(): Promise<void> {
        await setFailed({ id: this.id });
    }

    async success(): Promise<void> {
        await setSuccess({ id: this.id });
    }

    async cancel(): Promise<void> {
        await setCancelled({ id: this.id });
    }

    async timeout(): Promise<void> {
        await setTimeouted({ id: this.id });
    }
}

export interface OperationContextData extends FormatMessageData {
    start?: boolean;
}

export async function getOperationContext(
    data: OperationRowInsert,
    { start, account, user, environment }: SetRequired<OperationContextData, 'account'>
): Promise<LogContext> {
    const msg = getFormattedMessage(data, { account, user, environment });
    if (typeof start === 'undefined' || start) {
        msg.startedAt = msg.startedAt ?? new Date().toISOString();
        msg.state = msg.state === 'waiting' ? 'running' : msg.state;
    }
    await createMessage(msg);

    return new LogContext({ parentId: msg.id });
}

export function getExistingOperationContext({ id }: { id: MessageRow['id'] }): LogContext {
    if (!id) {
        logger.error('getExistingOperationContext: id is empty');
    }
    return new LogContext({ parentId: id });
}
