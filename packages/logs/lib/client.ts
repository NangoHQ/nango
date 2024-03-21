import type { MessageRow, MessageRowInsert, MessageMeta, OperationRowInsert } from './types/messages.js';
import { createOperation, setFinish, setRunning, setState, createMessage } from './models/messages.js';
import { nanoid } from './utils.js';

export class LogContext {
    parentId: string;

    constructor(opts: { parentId: string }) {
        this.parentId = opts.parentId;
    }

    /**
     * ------ Logs
     */
    async log(data: MessageRowInsert): Promise<void> {
        const row: MessageRow = {
            ...data,
            id: data.id || nanoid(),
            parentId: this.parentId,

            source: data.source || 'nango',
            level: data.level || 'info',
            title: data.title || null,
            code: data.code || null,
            state: data.state || 'waiting',

            meta: data.meta || null,
            error: data.error || null,
            request: data.request || null,
            response: data.response || null,

            createdAt: data.createdAt || new Date().toISOString()
        };
        await createMessage(row);
    }

    async debug(message: string, meta: MessageMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'debug', message, meta, source: 'nango' });
    }

    async info(message: string, meta: MessageMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'info', message, meta, source: 'nango' });
    }

    async warn(message: string, meta: MessageMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'warn', message, meta, source: 'nango' });
    }

    async error(message: string, meta: MessageMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'error', message, meta, source: 'nango' });
    }

    async trace(message: string, meta: MessageMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'trace', message, meta, source: 'nango' });
    }

    async http(message: string, data: Pick<MessageRow, 'request' | 'response' | 'meta'>): Promise<void> {
        const level: MessageRow['level'] = data.response && data.response.code >= 400 ? 'error' : 'info';
        await this.log({ type: 'http', level, message, ...data, source: 'nango' });
    }

    /**
     * ------ State
     */
    async start(): Promise<void> {
        await setRunning();
    }

    async failed(): Promise<void> {
        await setState('failed');
    }

    async cancel(): Promise<void> {
        await setState('cancelled');
    }

    async timeout(): Promise<void> {
        await setState('timeout');
    }

    async finish(): Promise<void> {
        await setFinish();
    }
}

export async function getOperationContext(data: OperationRowInsert): Promise<LogContext> {
    const id = data.id || nanoid();
    const res = await createOperation({
        ...data,
        id,
        source: data.source || 'nango',
        level: data.level || 'info',
        meta: data.meta || null,

        environmentId: data.environmentId || null,
        environmentName: data.environmentName || null,

        configId: data.configId || null,
        configName: data.configName || null,

        connectionId: data.connectionId || null,
        connectionName: data.connectionName || null,

        syncId: data.syncId || null,
        syncName: data.syncName || null,

        jobId: data.jobId || null,

        userId: data.userId || null,
        title: data.title || null,
        code: data.code || null,
        state: data.state || 'waiting',

        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        startedAt: data.startedAt || null,
        endedAt: data.endedAt || null
    });

    return new LogContext({ parentId: res.id });
}
