import type { MessageRow, MessageRowInsert, MessageMeta, OperationRow, MessageHTTPResponse, MessageHTTPRequest } from '@nangohq/types';
import { setRunning, createMessage, setFailed, setCancelled, setTimeouted, setSuccess, updateOperation } from './models/messages.js';
import { getFormattedMessage } from './models/helpers.js';
import { metrics, report } from '@nangohq/utils';
import { isCli, logger, logLevelToLogger } from './utils.js';
import { envs } from './env.js';
import type { OtlpSpan } from './otlp/otlpSpan.js';
import { errorToDocument } from './formatters.js';

interface Options {
    dryRun?: boolean;
    logToConsole?: boolean;
}

/**
 * Context without operation (stateless)
 * Only useful for logging
 */
export class LogContextStateless {
    id: OperationRow['id'];
    accountId?: OperationRow['accountId'] | undefined;
    dryRun: boolean;
    logToConsole: boolean;

    constructor(data: { id: OperationRow['id']; accountId?: OperationRow['accountId'] | undefined }, options: Options = { dryRun: false, logToConsole: true }) {
        this.id = data.id;
        this.accountId = data.accountId;
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
            logger[logLevelToLogger[data.level]](`${this.dryRun ? '[dry] ' : ''}log: ${data.message}`, Object.keys(obj).length > 0 ? obj : undefined);
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
            metrics.duration(metrics.Types.LOGS_LOG, Date.now() - start, { accountId: this.accountId as number });
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
            createdAt,
            endedAt: userDefinedEndedAt,
            ...data
        }: {
            request: MessageHTTPRequest | undefined;
            response: MessageHTTPResponse | undefined;
            error?: unknown;
            meta?: MessageRow['meta'];
            level?: MessageRow['level'];
            context?: MessageRow['context'];
            createdAt: Date;
            endedAt?: Date;
        }
    ): Promise<boolean> {
        const level: MessageRow['level'] = data.level ?? (data.response && data.response.code >= 400 ? 'error' : 'info');
        const endedAt = userDefinedEndedAt || new Date();
        return await this.log({
            type: 'http',
            level,
            message,
            ...data,
            error: errorToDocument(error),
            source: 'internal',
            createdAt: createdAt.toISOString(),
            endedAt: endedAt.toISOString(),
            durationMs: endedAt.getTime() - createdAt.getTime()
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
 * Main class that contain operation level methods
 * With recent refactor it could be re-grouped with Stateless
 */
export class LogContext extends LogContextStateless {
    createdAt: string;
    span?: OtlpSpan;

    constructor(
        { id, createdAt, accountId }: { id: string; createdAt: string; accountId?: number | undefined },
        options: Options = { dryRun: false, logToConsole: true }
    ) {
        super({ id, accountId }, options);
        this.createdAt = createdAt;
    }

    /**
     * We are using internal logging system to log to OpenTelemetry
     * Unfortunately, by design, our logging system is not compatible
     * so we sometimes have to trick and inject a span because it was started elsewhere
     */
    attachSpan(otlpSpan: OtlpSpan) {
        this.span = otlpSpan;
    }

    /**
     * Add more data to the operation id
     */
    async enrichOperation(data: Partial<OperationRow>): Promise<void> {
        this.span?.enrich(data);
        await this.logOrExec(
            `enrich(${JSON.stringify(data)})`,
            async () => await updateOperation({ id: this.id, data: { ...data, createdAt: this.createdAt } })
        );
    }

    /**
     * ------ State
     */
    async start(): Promise<void> {
        await this.logOrExec('start', async () => await setRunning({ id: this.id, createdAt: this.createdAt }));
    }

    async failed(): Promise<void> {
        await this.logOrExec('failed', async () => {
            await setFailed({ id: this.id, createdAt: this.createdAt });
            this.span?.end('failed');
        });
    }

    async success(): Promise<void> {
        await this.logOrExec('success', async () => {
            await setSuccess({ id: this.id, createdAt: this.createdAt });
            this.span?.end('success');
        });
    }

    async cancel(): Promise<void> {
        await this.logOrExec('cancel', async () => {
            await setCancelled({ id: this.id, createdAt: this.createdAt });
            this.span?.end('cancelled');
        });
    }

    async timeout(): Promise<void> {
        await this.logOrExec('timeout', async () => {
            await setTimeouted({ id: this.id, createdAt: this.createdAt });
            this.span?.end('timeout');
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

/**
 * Small extend that allows code to access the created operation
 * Only useful for OTLP and debugging.
 * It should be relied too much upon as we don't have access to the `operation` as soon as an operation becomes multi-services
 */
export class LogContextOrigin extends LogContext {
    operation: OperationRow;

    constructor({ operation }: { operation: OperationRow }, options: Options = { dryRun: false, logToConsole: true }) {
        super({ id: operation.id, createdAt: operation.createdAt, accountId: operation.accountId }, options);
        this.operation = operation;
    }
}
