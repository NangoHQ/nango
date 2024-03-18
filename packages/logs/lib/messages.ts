import { db } from './db/client';
import type { MessageRow } from './types/messages';
import type { OperationRow } from './types/operations';

export async function listMessages(opts: { operationId: OperationRow['id']; limit: number }): Promise<MessageRow[]> {
    return await db
        .table<MessageRow>('messages')
        .select<MessageRow[]>('*')
        .where({ operation_id: opts.operationId })
        .limit(opts.limit)
        .orderBy('created_at', 'ASC');
}
