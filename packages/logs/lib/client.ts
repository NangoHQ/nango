import type { MessageRow, MessageRowInsert, MessageMeta, OperationRowInsert } from './types/messages.js';
import { setRunning, createMessage, setFailed, setCancelled, setTimeouted, setSuccess, update } from './models/messages.js';
import type { FormatMessageData } from './models/helpers.js';
import { getFormattedMessage } from './models/helpers.js';
import type { SetRequired } from 'type-fest';
import { errorToObject, metrics, stringifyError } from '@nangohq/utils';
import { logger } from './utils.js';
import { envs } from './env.js';

interface Options {
    dryRun?: boolean;
    logToConsole?: boolean;
}

export class LogContext {
    id: string;
    dryRun: boolean;
    logToConsole: boolean;

    constructor(data: { parentId: string }, options: Options = { dryRun: false, logToConsole: true }) {
        this.id = data.parentId;
        this.dryRun = envs.NANGO_LOGS_ENABLED === true ? options.dryRun || false : true;
        this.logToConsole = options.logToConsole ?? true;
    }

    /**
     * Add more data to the parentId
     */
    async enrichOperation(data: Partial<MessageRow>): Promise<void> {
        if (this.logToConsole) {
            logger.info(`[debug] enrich(${JSON.stringify(data)})`);
        }
        if (this.dryRun) {
            return;
        }

        try {
            await update({ id: this.id, data });
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_enrich ${stringifyError(err)}`);
        }
    }

    /**
     * ------ Logs
     */
    async log(data: MessageRowInsert): Promise<void> {
        if (this.logToConsole) {
            logger.info(`[debug] log(${JSON.stringify(data)})`);
        }
        if (this.dryRun) {
            return;
        }

        const start = Date.now();
        try {
            await createMessage(getFormattedMessage({ ...data, parentId: this.id }));
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_insert_in_es: ${stringifyError(err)}`);
        } finally {
            metrics.duration(metrics.Types.LOGS_LOG, Date.now() - start);
        }
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

    /**
     * @deprecated Only there for retro compat
     */
    async trace(message: string, meta: MessageMeta | null = null): Promise<void> {
        await this.log({ type: 'log', level: 'debug', message, meta, source: 'internal' });
    }

    async http(message: string, data: Pick<MessageRow, 'request' | 'response' | 'meta'>): Promise<void> {
        const level: MessageRow['level'] = data.response && data.response.code >= 400 ? 'error' : 'info';
        await this.log({ type: 'http', level, message, ...data, source: 'internal' });
    }

    /**
     * ------ State
     */
    async start(): Promise<void> {
        if (this.logToConsole) {
            logger.info(`[debug] start(${this.id})`);
        }
        if (this.dryRun) {
            return;
        }

        try {
            await setRunning({ id: this.id });
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_enrich ${stringifyError(err)}`);
        }
    }

    async failed(): Promise<void> {
        if (this.logToConsole) {
            logger.info(`[debug] failed(${this.id})`);
        }
        if (this.dryRun) {
            return;
        }

        try {
            await setFailed({ id: this.id });
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_set_failed ${stringifyError(err)}`);
        }
    }

    async success(): Promise<void> {
        if (this.logToConsole) {
            logger.info(`[debug] success(${this.id})`);
        }
        if (this.dryRun) {
            return;
        }

        try {
            await setSuccess({ id: this.id });
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_set_success ${stringifyError(err)}`);
        }
    }

    async cancel(): Promise<void> {
        if (this.logToConsole) {
            logger.info(`[debug] cancel(${this.id})`);
        }
        if (this.dryRun) {
            return;
        }

        try {
            await setCancelled({ id: this.id });
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_set_cancelled ${stringifyError(err)}`);
        }
    }

    async timeout(): Promise<void> {
        if (this.logToConsole) {
            logger.info(`[debug] timeout(${this.id})`);
        }
        if (this.dryRun) {
            return;
        }

        try {
            await setTimeouted({ id: this.id });
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_set_timeout ${stringifyError(err)}`);
        }
    }
}

export interface OperationContextData extends FormatMessageData {
    start?: boolean;
}

/**
 * Create an operation and return a context
 */
export async function getOperationContext(
    data: OperationRowInsert,
    { start, account, user, environment }: SetRequired<OperationContextData, 'account'>,
    options?: Options
): Promise<LogContext> {
    const msg = getFormattedMessage(data, { account, user, environment });
    if (typeof start === 'undefined' || start) {
        msg.startedAt = msg.startedAt ?? new Date().toISOString();
        msg.state = msg.state === 'waiting' ? 'running' : msg.state;
    }

    try {
        if (envs.NANGO_LOGS_ENABLED && !options?.dryRun) {
            await createMessage(msg);
        } else if (options?.logToConsole !== false) {
            logger.info(`[debug] operation(${JSON.stringify(msg)})`);
        }
    } catch (err) {
        // TODO: reup throw
        logger.error(`failed_to_create_operation ${stringifyError(err)}`);
    }

    return new LogContext({ parentId: msg.id }, options);
}

/**
 * Return a context without creating an operation
 */
export function getExistingOperationContext({ id }: { id: MessageRow['id'] }): LogContext {
    if (!id) {
        logger.error('getExistingOperationContext: id is empty');
    }

    return new LogContext({ parentId: id });
}
