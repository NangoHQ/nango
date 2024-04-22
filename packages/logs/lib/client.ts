import type { MessageRow, MessageRowInsert, MessageMeta, OperationRowInsert } from './types/messages.js';
import { setRunning, createMessage, setFailed, setCancelled, setTimeouted, setSuccess, update } from './models/messages.js';
import type { FormatMessageData } from './models/helpers.js';
import { getFormattedMessage } from './models/helpers.js';
import type { SetRequired } from 'type-fest';
import { errorToObject, metrics, stringifyError } from '@nangohq/utils';
import { isCli, logger } from './utils.js';
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
        this.dryRun = !isCli || envs.NANGO_LOGS_ENABLED === true ? options.dryRun || false : true;
        this.logToConsole = options.logToConsole ?? true;
    }

    /**
     * Add more data to the parentId
     */
    async enrichOperation(data: Partial<MessageRow>): Promise<void> {
        await this.logOrExec(`enrich(${JSON.stringify(data)})`, async () => await update({ id: this.id, data }));
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
        await this.logOrExec('start', async () => await setRunning({ id: this.id }));
    }

    async failed(): Promise<void> {
        await this.logOrExec('failed', async () => await setFailed({ id: this.id }));
    }

    async success(): Promise<void> {
        await this.logOrExec('success', async () => await setSuccess({ id: this.id }));
    }

    async cancel(): Promise<void> {
        await this.logOrExec('cancel', async () => await setCancelled({ id: this.id }));
    }

    async timeout(): Promise<void> {
        await this.logOrExec('timeout', async () => await setTimeouted({ id: this.id }));
    }

    private async logOrExec(log: string, callback: () => Promise<void>) {
        if (this.logToConsole) {
            logger.info(`[debug] ${log}(${this.id})`);
        }
        if (this.dryRun) {
            return;
        }

        try {
            await callback();
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_set_${log} ${stringifyError(err)}`);
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
    { start, account, user, environment }: SetRequired<OperationContextData, 'account' | 'environment'>,
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
