import { client } from '../es/client.js';
import type { MessageRow, OperationRow } from '../types/messages.js';
/**
 * Create one operation
 */
export async function createOperation(data: OperationRow): Promise<Pick<OperationRow, 'id'>> {
    await client.create<MessageRow>({
        index: 'messages',
        id: data.id,
        document: data
    });
}

/**
 * List operations
 */
export async function listOperations(opts: { limit: number }): Promise<OperationRow[]> {
    return await db.table<OperationRow>('operations').select('*').limit(opts.limit).orderBy('created_at', 'DESC');
}

/**
 * Get a single operation
 */
export async function getOperation(opts: { id: OperationRow['id'] }): Promise<OperationRow | undefined> {
    return await db.table<OperationRow>('operations').select('*').where({ id: opts.id }).limit(1).first();
}

/**
 * Set an operation as currently running
 */
export async function setRunning(): Promise<void> {
    await db.table<OperationTable>('operations').update({ state: 'running', updated_at: db.fn.now(), started_at: db.fn.now() });
}

/**
 * Set an operation as finished
 */
export async function setFinish(): Promise<void> {
    await db.table<OperationTable>('operations').update({
        state: db.raw(`CASE WHEN state = 'waiting' OR state = 'running' THEN 'success' ELSE state END`),
        updated_at: db.fn.now(),
        started_at: db.raw('COALESCE(started_at, NOW())'),
        ended_at: db.fn.now()
    });
}

/**
 * Set an operation intermediate state
 */
export async function setState(state: OperationRow['state']): Promise<void> {
    await db.table<OperationTable>('operations').update({ state, updated_at: db.fn.now(), started_at: db.raw('COALESCE(started_at, NOW())') });
}

/**
 * Create one message
 */
export async function createMessage(row: MessageRow): Promise<void> {
    await client.create<MessageRow>({
        index: 'messages',
        id: row.id,
        document: row
    });
}

/**
 * List messages
 */
export async function listMessages(opts: { operationId: MessageRow['parentId']; limit: number }): Promise<MessageRow[]> {
    return await db
        .table<MessageRow>('messages')
        .select<MessageRow[]>('*')
        .where({ operation_id: opts.operationId })
        .limit(opts.limit)
        .orderBy('created_at', 'ASC');
}
