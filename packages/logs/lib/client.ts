import type { OperationRequired } from './types/operations.js';
import type { MessageRow, MessageRowInsert, MsgMeta } from './types/messages.js';
import { createOperation, setFinish, setRunning, setState } from './models/operations.js';
import { createMessage } from './models/messages.js';
import { nanoid } from './es/helpers.js';

export class LogContext {
    operationId: string;

    constructor(opts: { operationId: string }) {
        this.operationId = opts.operationId;
    }

    /**
     * ------ Logs
     */
    async log(data: MessageRowInsert): Promise<void> {
        const row: MessageRowInsert = {
            operationId: this.operationId,
            ...data,

            id: data.id || nanoid()
        };
        await createMessage(row);
    }

    async debug(message: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'debug', message, meta, source: 'nango' });
    }

    async info(message: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'info', message, meta, source: 'nango' });
    }

    async warn(message: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'warn', message, meta, source: 'nango' });
    }

    async error(message: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'error', message, meta, source: 'nango' });
    }

    async trace(message: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'trace', message, meta, source: 'nango' });
    }

    async http(message: string, request: MessageRow['request'], response: MessageRow['response'], meta: MsgMeta = null): Promise<void> {
        const level: MessageRow['level'] = response && response.code >= 400 ? 'error' : 'info';
        await this.log({ type: 'http', level, message, request, response, meta, source: 'nango' });
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

export async function getOperationContext(data: OperationRequired): Promise<LogContext> {
    const res = await createOperation(data);

    return new LogContext({ operationId: res.id });
}
