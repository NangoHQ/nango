import { db } from './db/client';

import type { OperationCtx, OperationRow, OperationTable } from './types/operations';
import type { MessageContent, MessageRowInsert, MessageTable, MsgMeta } from './types/messages';

export class LogContext {
    operationId: string;

    constructor(opts: { operationId: string }) {
        this.operationId = opts.operationId;
    }

    /**
     * Log to table
     */
    async log(content: MessageContent, opts?: { id?: string }): Promise<void> {
        const row: MessageRowInsert = {
            id: opts?.id,
            operation_id: this.operationId,
            content: {
                ...content
            }
        };
        await db.table<MessageTable>('messages').insert(row);
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

    async err(msg: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'error', msg, meta, source: 'nango' });
    }

    async trace(msg: string, meta: MsgMeta = null): Promise<void> {
        await this.log({ type: 'log', level: 'trace', msg, meta, source: 'nango' });
    }

    /**
     * ------ STATE
     */
    async start(): Promise<void> {
        await db.table<OperationTable>('operations').update({ state: 'running', updated_at: db.fn.now(), started_at: db.fn.now() });
    }

    async failed(): Promise<void> {
        await this.state('failed');
    }

    async cancel(): Promise<void> {
        await this.state('cancelled');
    }

    async timeout(): Promise<void> {
        await this.state('timeout');
    }

    async finish(): Promise<void> {
        await db.table<OperationTable>('operations').update({
            state: db.raw(`CASE WHEN state = 'waiting' OR state = 'running' THEN 'success' ELSE state END`),
            updated_at: db.fn.now(),
            started_at: db.raw('COALESCE(started_at, NOW())'),
            ended_at: db.fn.now()
        });
    }

    private async state(state: OperationRow['state']): Promise<void> {
        await db.table<OperationTable>('operations').update({ state, updated_at: db.fn.now() });
    }
}

export async function getOperationContext(data: OperationCtx): Promise<LogContext> {
    const res = await db.table('operations').insert(data).returning<{ id: string }>('id');
    return new LogContext({ operationId: res.id });
}
