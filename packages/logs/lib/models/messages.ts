import { db } from '../db/client';
import type { MessageRow, MessageRowInsert, MessageTable } from '../types/messages';
import type { OperationRow } from '../types/operations';

/**
 * Create one message
 */
export async function createMessage(row: MessageRowInsert): Promise<void> {
    await db.table<MessageTable>('messages').insert(row);
}

/**
 * List messages
 */
export async function listMessages(opts: { operationId: OperationRow['id']; limit: number }): Promise<MessageRow[]> {
    return await db
        .table<MessageRow>('messages')
        .select<MessageRow[]>('*')
        .where({ operation_id: opts.operationId })
        .limit(opts.limit)
        .orderBy('created_at', 'ASC');
}
