import { db } from '../db/client';
import type { OperationRequired, OperationRow, OperationTable } from '../types/operations';

/**
 * Create one operation
 */
export async function createOperation(data: OperationRequired): Promise<Pick<OperationRow, 'id'>> {
    const res = await db.table('operations').insert(data).returning<Pick<OperationRow, 'id'>[]>('id');
    if (!res || res.length <= 0 || !res[0]) {
        throw new Error('failed_to_create_operation');
    }

    return res[0];
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
