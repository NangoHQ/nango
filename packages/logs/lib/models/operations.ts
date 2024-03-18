import { db } from '../db/client';
import type { OperationRow } from '../types/operations';

export async function listOperations(opts: { limit: number }): Promise<OperationRow[]> {
    return await db.table<OperationRow>('operations').select('*').limit(opts.limit).orderBy('created_at', 'DESC');
}

export async function getOperation(opts: { id: OperationRow['id'] }): Promise<OperationRow | undefined> {
    return await db.table<OperationRow>('operations').select('*').where({ id: opts.id }).limit(1).first();
}
