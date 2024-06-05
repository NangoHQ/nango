import type { MessageRow, MessageRowInsert, MessageMeta, OperationRow } from '@nangohq/types';
import { setRunning, createMessage, setFailed, setCancelled, setTimeouted, setSuccess, update } from './models/messages.js';
import { getFormattedMessage } from './models/helpers.js';
import { errorToObject, metrics, stringifyError } from '@nangohq/utils';
import { isCli, logger } from './utils.js';
import { envs } from './env.js';

interface Options {
    dryRun?: boolean;
    logToConsole?: boolean;
}

/**
 * Context without operation (stateless)
 */
export class LogContextStateless {
    id: string;
    dryRun: boolean;
    logToConsole: boolean;

    constructor(data: { parentId: string }, options: Options = { dryRun: false, logToConsole: true }) {
        this.id = data.parentId;
        this.dryRun = isCli || !envs.NANGO_LOGS_ENABLED ? true : options.dryRun || false;
        this.logToConsole = options.logToConsole ?? true;
    }

    async log(data: MessageRowInsert): Promise<boolean> {
        if (this.logToConsole) {
            logger.info(`[debug] log(${JSON.stringify(data)})`);
        }
        if (this.dryRun) {
            return true;
        }

        const start = Date.now();
        try {
            await createMessage(getFormattedMessage({ ...data, parentId: this.id }));
            return true;
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_insert_in_es: ${stringifyError(err)}`);
            return false;
        } finally {
            metrics.duration(metrics.Types.LOGS_LOG, Date.now() - start);
        }
    }

    async debug(message: string, meta: MessageMeta | null = null): Promise<boolean> {
        return await this.log({ type: 'log', level: 'debug', message, meta, source: 'internal' });
    }

    async info(message: string, meta: MessageMeta | null = null): Promise<boolean> {
        return await this.log({ type: 'log', level: 'info', message, meta, source: 'internal' });
    }

    async warn(message: string, meta: MessageMeta | null = null): Promise<boolean> {
        return await this.log({ type: 'log', level: 'warn', message, meta, source: 'internal' });
    }

    async error(message: string, meta: (MessageMeta & { error?: unknown; err?: never; e?: never }) | null = null): Promise<boolean> {
        const { error, ...rest } = meta || {};
        const err = error ? { name: 'Unknown Error', message: 'unknown error', ...errorToObject(error) } : null;
        return await this.log({
            type: 'log',
            level: 'error',
            message,
            error: err ? { name: err.name, message: err.message } : null,
            meta: Object.keys(rest).length > 0 ? rest : null,
            source: 'internal'
        });
    }

    /**
     * @deprecated Only there for retro compat
     */
    async trace(message: string, meta: MessageMeta | null = null): Promise<boolean> {
        return await this.log({ type: 'log', level: 'debug', message, meta, source: 'internal' });
    }

    async http(message: string, data: Pick<MessageRow, 'request' | 'response' | 'meta'>): Promise<boolean> {
        const level: MessageRow['level'] = data.response && data.response.code >= 400 ? 'error' : 'info';
        return await this.log({ type: 'http', level, message, ...data, source: 'internal' });
    }
}

/**
 * Context with operation (can modify state)
 */
export class LogContext extends LogContextStateless {
    operation: OperationRow;

    constructor(data: { parentId: string; operation: OperationRow }, options: Options = { dryRun: false, logToConsole: true }) {
        super(data, options);
        this.operation = data.operation;
    }

    /**
     * Add more data to the parentId
     */
    async enrichOperation(data: Partial<MessageRow>): Promise<void> {
        await this.logOrExec(
            `enrich(${JSON.stringify(data)})`,
            async () => await update({ id: this.id, data: { ...data, createdAt: this.operation.createdAt } })
        );
    }

    /**
     * ------ State
     */
    async start(): Promise<void> {
        await this.logOrExec('start', async () => await setRunning(this.operation));
    }

    async failed(): Promise<void> {
        await this.logOrExec('failed', async () => await setFailed(this.operation));
    }

    async success(): Promise<void> {
        await this.logOrExec('success', async () => await setSuccess(this.operation));
    }

    async cancel(): Promise<void> {
        await this.logOrExec('cancel', async () => await setCancelled(this.operation));
    }

    async timeout(): Promise<void> {
        await this.logOrExec('timeout', async () => await setTimeouted(this.operation));
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
