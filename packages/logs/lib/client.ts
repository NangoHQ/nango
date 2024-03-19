import type { OperationRequired } from './types/operations.js';
import type { MessageContent, MessageRowInsert, MsgMeta } from './types/messages.js';
import { createOperation, setFinish, setRunning, setState } from './models/operations.js';
import { createMessage } from './models/messages.js';

export class LogContext {
    operationId: string;

    constructor(opts: { operationId: string }) {
        this.operationId = opts.operationId;
    }

    /**
     * ------ Logs
     */
    async log(content: MessageContent, opts?: { id?: string }): Promise<void> {
        const row: MessageRowInsert = {
            id: opts?.id,
            operation_id: this.operationId,
            content: {
                ...content
            }
        };
        await createMessage(row);
    }

    async debug(msg: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'debug', msg, meta, source: 'nango' });
    }

    async info(msg: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'info', msg, meta, source: 'nango' });
    }

    async warn(msg: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'warn', msg, meta, source: 'nango' });
    }

    async error(msg: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'error', msg, meta, source: 'nango' });
    }

    async trace(msg: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'trace', msg, meta, source: 'nango' });
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
