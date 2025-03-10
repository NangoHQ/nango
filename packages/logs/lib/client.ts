import type { MessageRow, MessageRowInsert, MessageMeta, OperationRow, MessageHTTPResponse, MessageHTTPRequest } from '@nangohq/types';
import { setRunning, createMessage, setFailed, setCancelled, setTimeouted, setSuccess, updateOperation } from './models/messages.js';
import { getFormattedMessage } from './models/helpers.js';
import { metrics, report } from '@nangohq/utils';
import { isCli, logger, logLevelToLogger } from './utils.js';
import { envs } from './env.js';
import { OtlpSpan } from './otlp/otlpSpan.js';
import { errorToDocument } from './formatters.js';

interface Options {
    dryRun?: boolean;
    logToConsole?: boolean;
}

/**
 * Context without operation (stateless)
 */
export class LogContextStateless {
    id: OperationRow['id'];
    dryRun: boolean;
    logToConsole: boolean;

    constructor(data: { parentId: OperationRow['id'] }, options: Options = { dryRun: false, logToConsole: true }) {
        this.id = data.parentId;
        this.dryRun = isCli || !envs.NANGO_LOGS_ENABLED ? true : options.dryRun || false;
        this.logToConsole = options.logToConsole ?? true;
    }

    async log(data: MessageRowInsert): Promise<boolean> {
        if (data.error && data.error.constructor.name !== 'Object') {
            data.error = errorToDocument(data.error);
        }

        if (this.logToConsole) {
            const obj: Record<string, any> = {};
            if (data.error) obj['error'] = data.error;
            if (data.meta) obj['meta'] = data.meta;
            logger[logLevelToLogger[data.level!]](`${this.dryRun ? '[dry] ' : ''}log: ${data.message}`, Object.keys(obj).length > 0 ? obj : undefined);
        }
        if (this.dryRun) {
            return true;
        }

        const start = Date.now();
        try {
            await createMessage(getFormattedMessage({ ...data, parentId: this.id }));
            return true;
        } catch (err) {
            report(new Error('failed_to_insert_in_es', { cause: err }));
            return false;
        } finally {
            metrics.duration(metrics.Types.LOGS_LOG, Date.now() - start);
        }
    }

    async debug(message: string, meta?: MessageMeta): Promise<boolean> {
        return await this.log({ type: 'log', level: 'debug', message, meta, source: 'internal', createdAt: new Date().toISOString() });
    }

    async info(message: string, meta?: MessageMeta): Promise<boolean> {
        return await this.log({ type: 'log', level: 'info', message, meta, source: 'internal', createdAt: new Date().toISOString() });
    }

    async warn(message: string, meta?: MessageMeta): Promise<boolean> {
        return await this.log({ type: 'log', level: 'warn', message, meta, source: 'internal', createdAt: new Date().toISOString() });
    }

    async error(message: string, meta: (MessageMeta & { error?: unknown; err?: never; e?: never }) | null = null): Promise<boolean> {
        const { error, ...rest } = meta || {};
        return await this.log({
            type: 'log',
            level: 'error',
            message,
            error: errorToDocument(error),
            meta: Object.keys(rest).length > 0 ? rest : undefined,
            source: 'internal',
            createdAt: new Date().toISOString()
        });
    }

    async http(
        message: string,
        {
            error,
            ...data
        }: {
            request: MessageHTTPRequest | undefined;
            response: MessageHTTPResponse | undefined;
            error?: unknown;
            meta?: MessageRow['meta'];
            level?: MessageRow['level'];
        }
    ): Promise<boolean> {
        const level: MessageRow['level'] = data.level ?? (data.response && data.response.code >= 400 ? 'error' : 'info');
        return await this.log({
            type: 'http',
            level,
            message,
            ...data,
            error: errorToDocument(error),
            source: 'internal',
            createdAt: new Date().toISOString()
        });
    }

    /**
     * @deprecated Only there for retro compat
     */
    async trace(message: string, meta?: MessageMeta): Promise<boolean> {
        return await this.log({ type: 'log', level: 'debug', message, meta, source: 'internal', createdAt: new Date().toISOString() });
    }
}

/**
 * Context with operation (can modify state)
 */
export class LogContext extends LogContextStateless {
    operation: OperationRow;
    span: OtlpSpan;

    constructor(data: { parentId: string; operation: OperationRow }, options: Options = { dryRun: false, logToConsole: true }) {
        super(data, options);
        this.operation = data.operation;
        this.span = new OtlpSpan(data.operation);
    }

    /**
     * Add more data to the parentId
     */
    async enrichOperation(data: Partial<OperationRow>): Promise<void> {
        this.span.enrich(data);
        await this.logOrExec(
            `enrich(${JSON.stringify(data)})`,
            async () => await updateOperation({ id: this.id, data: { ...data, createdAt: this.operation.createdAt } })
        );
    }

    /**
     * ------ State
     */
    async start(): Promise<void> {
        await this.logOrExec('start', async () => await setRunning(this.operation));
    }

    async failed(): Promise<void> {
        await this.logOrExec('failed', async () => {
            await setFailed(this.operation);
            this.span.end('failed');
        });
    }

    async success(): Promise<void> {
        await this.logOrExec('success', async () => {
            await setSuccess(this.operation);
            this.span.end('success');
        });
    }

    async cancel(): Promise<void> {
        await this.logOrExec('cancel', async () => {
            await setCancelled(this.operation);
            this.span.end('cancelled');
        });
    }

    async timeout(): Promise<void> {
        await this.logOrExec('timeout', async () => {
            await setTimeouted(this.operation);
            this.span.end('timeout');
        });
    }

    private async logOrExec(log: string, callback: () => Promise<void>) {
        if (this.logToConsole) {
            logger.info(`${this.dryRun ? '[dry] ' : ''}${log}(${this.id})`);
        }
        if (this.dryRun) {
            return;
        }

        try {
            await callback();
        } catch (err) {
            report(new Error(`failed_to_set_${log}`, { cause: err }));
        }
    }
}
