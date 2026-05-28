import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import { remoteFunctionDryrunSandboxTimeoutMs } from '../remote-function/runtime.js';

import type {
    FunctionDryrunBody,
    FunctionDryrunCreateSuccess,
    FunctionDryrunResultSuccess,
    FunctionDryrunStatus,
    FunctionErrorCode,
    Result
} from '@nangohq/types';
import type { Knex } from 'knex';

const tableName = 'function_dryruns';
const dryrunTimeoutError = { code: 'timeout', message: 'Dry run timed out' } satisfies FunctionDryrunError;

export interface FunctionDryrunStoredRequest extends FunctionDryrunBody {
    function_name: string;
}

export interface FunctionDryrunError {
    code: FunctionErrorCode;
    message: string;
    payload?: unknown;
}

export interface DBFunctionDryrun {
    id: string;
    environment_id: number;
    request: FunctionDryrunStoredRequest;
    status: FunctionDryrunStatus;
    sandbox_id: string | null;
    output: string | null;
    result: unknown;
    has_result: boolean;
    error: FunctionDryrunError | null;
    duration_ms: number | null;
    execution_timeout_at: Date | string | null;
    started_at: Date | string | null;
    completed_at: Date | string | null;
    created_at: Date | string;
    updated_at: Date | string;
}

export async function createFunctionDryrun({
    environmentId,
    request,
    trx = db.knex
}: {
    environmentId: number;
    request: FunctionDryrunStoredRequest;
    trx?: Knex;
}): Promise<Result<FunctionDryrunCreateSuccess>> {
    try {
        const [row] = await trx<DBFunctionDryrun>(tableName)
            .insert({
                environment_id: environmentId,
                request: jsonb(trx, request),
                status: 'waiting'
            })
            .returning('*');

        if (!row) {
            return Err(new Error('Failed to create function dryrun'));
        }

        return Ok(toFunctionDryrunCreate(row));
    } catch (err) {
        return Err(err);
    }
}

export async function getFunctionDryrunRow({
    environmentId,
    id,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    trx?: Knex;
}): Promise<DBFunctionDryrun | null> {
    const row = await trx<DBFunctionDryrun>(tableName).where({ id, environment_id: environmentId }).first();
    return row || null;
}

export async function getFunctionDryrun({
    environmentId,
    id,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    trx?: Knex;
}): Promise<FunctionDryrunResultSuccess | null> {
    const row = await getFunctionDryrunRow({ environmentId, id, trx });
    return row ? toFunctionDryrunResult(row) : null;
}

export async function markFunctionDryrunRunning({
    environmentId,
    id,
    sandboxId,
    startedAt,
    executionTimeoutAt,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    sandboxId: string;
    startedAt: Date;
    executionTimeoutAt: Date;
    trx?: Knex;
}): Promise<DBFunctionDryrun | null> {
    const [row] = await trx<DBFunctionDryrun>(tableName)
        .where({ id, environment_id: environmentId, status: 'waiting' })
        .update({
            status: 'running',
            sandbox_id: sandboxId,
            started_at: startedAt,
            execution_timeout_at: executionTimeoutAt,
            updated_at: trx.fn.now()
        })
        .returning('*');

    return row || null;
}

export async function markFunctionDryrunSuccess({
    environmentId,
    id,
    output,
    result,
    hasResult,
    durationMs,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    output: string;
    result?: unknown;
    hasResult: boolean;
    durationMs?: number | undefined;
    trx?: Knex;
}): Promise<DBFunctionDryrun | null> {
    const [row] = await trx<DBFunctionDryrun>(tableName)
        .where({ id, environment_id: environmentId })
        .whereIn('status', ['waiting', 'running'])
        .update({
            status: 'success',
            output,
            result: hasResult ? jsonb(trx, result ?? null) : null,
            has_result: hasResult,
            duration_ms: durationMs ?? null,
            completed_at: trx.fn.now(),
            updated_at: trx.fn.now()
        })
        .returning('*');

    return row || null;
}

export async function markFunctionDryrunFailed({
    environmentId,
    id,
    error,
    output,
    durationMs,
    statuses = ['waiting', 'running'],
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    error: FunctionDryrunError;
    output?: string | undefined;
    durationMs?: number | undefined;
    statuses?: FunctionDryrunStatus[] | undefined;
    trx?: Knex;
}): Promise<DBFunctionDryrun | null> {
    const [row] = await trx<DBFunctionDryrun>(tableName)
        .where({ id, environment_id: environmentId })
        .whereIn('status', statuses)
        .update({
            status: 'failed',
            error: jsonb(trx, error),
            output: output ?? null,
            duration_ms: durationMs ?? null,
            completed_at: trx.fn.now(),
            updated_at: trx.fn.now()
        })
        .returning('*');

    return row || null;
}

export async function timeoutFunctionDryruns({ limit = 100, trx }: { limit?: number; trx?: Knex.Transaction } = {}): Promise<number> {
    const updateTimedOutDryruns = async (transaction: Knex.Transaction): Promise<number> => {
        const waitingTimeoutThreshold = transaction.raw("CURRENT_TIMESTAMP - (? * INTERVAL '1 millisecond')", [remoteFunctionDryrunSandboxTimeoutMs]);

        // Hold locks through the update so a sandbox callback completing the row is not overwritten.
        const candidates = await transaction<DBFunctionDryrun>(tableName)
            .select('id')
            .where((query) => {
                query
                    .where((running) => {
                        running.where({ status: 'running' }).whereNotNull('execution_timeout_at').where('execution_timeout_at', '<', transaction.fn.now());
                    })
                    .orWhere((waiting) => {
                        waiting.where({ status: 'waiting' }).where('created_at', '<', waitingTimeoutThreshold);
                    });
            })
            .orderByRaw('COALESCE(execution_timeout_at, created_at) ASC')
            .limit(limit)
            .forUpdate()
            .skipLocked();

        if (candidates.length === 0) {
            return 0;
        }

        const rows = await transaction<DBFunctionDryrun>(tableName)
            .whereIn('status', ['waiting', 'running'])
            .whereIn(
                'id',
                candidates.map((candidate) => candidate.id)
            )
            .update({
                status: 'failed',
                error: jsonb(transaction, dryrunTimeoutError),
                completed_at: transaction.fn.now(),
                updated_at: transaction.fn.now()
            })
            .returning('id');

        return rows.length;
    };

    return trx ? updateTimedOutDryruns(trx) : db.knex.transaction(updateTimedOutDryruns);
}

export async function deleteFunctionDryrunsOlderThan({
    limit = 1000,
    olderThanDays = 14,
    trx = db.knex
}: {
    limit?: number;
    olderThanDays?: number;
    trx?: Knex;
} = {}): Promise<number> {
    const cutoff = trx.raw("CURRENT_TIMESTAMP - (? * INTERVAL '1 day')", [olderThanDays]);
    const ids = trx<DBFunctionDryrun>(tableName).select('id').where('created_at', '<', cutoff).orderBy('created_at', 'asc').limit(limit);
    const rows = await trx<DBFunctionDryrun>(tableName).whereIn('id', ids).delete().returning('id');

    return rows.length;
}

export function toFunctionDryrunCreate(row: DBFunctionDryrun): FunctionDryrunCreateSuccess {
    if (row.status !== 'waiting' && row.status !== 'running') {
        throw new Error(`Cannot create function dryrun response for '${row.status}' dryrun`);
    }

    return {
        id: row.id,
        status: row.status,
        created_at: toIsoString(row.created_at)
    };
}

export function toFunctionDryrunResult(row: DBFunctionDryrun): FunctionDryrunResultSuccess {
    return {
        id: row.id,
        status: row.status,
        integration_id: row.request.integration_id,
        function_type: row.request.function_type,
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
        ...(row.started_at ? { started_at: toIsoString(row.started_at) } : {}),
        ...(row.completed_at ? { completed_at: toIsoString(row.completed_at) } : {}),
        ...(row.duration_ms !== null ? { duration_ms: row.duration_ms } : {}),
        ...(row.output !== null ? { output: row.output } : {}),
        ...(row.has_result ? { result: row.result } : {}),
        ...(row.error ? { error: row.error } : {})
    };
}

function toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonb(trx: Knex, value: unknown): Knex.Raw {
    return trx.raw('?::jsonb', [JSON.stringify(value)]);
}
