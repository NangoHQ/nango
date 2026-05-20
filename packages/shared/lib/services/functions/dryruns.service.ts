import db from '@nangohq/database';

import type { FunctionDryrunBody, FunctionDryrunCreateSuccess, FunctionDryrunResultSuccess, FunctionDryrunStatus, FunctionErrorCode } from '@nangohq/types';
import type { Knex } from 'knex';

const tableName = 'function_dryruns';

export const internalFunctionDryrunActionName = '__nango_function_dryrun__';

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
}): Promise<FunctionDryrunCreateSuccess> {
    const [row] = await trx<DBFunctionDryrun>(tableName)
        .insert({
            environment_id: environmentId,
            request: jsonb(request),
            status: 'pending'
        })
        .returning('*');

    if (!row) {
        throw new Error('Failed to create function dryrun');
    }

    return toCreateResponse(row);
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
    return row ? toResultResponse(row) : null;
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
        .where({ id, environment_id: environmentId, status: 'pending' })
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

export async function markFunctionDryrunSucceeded({
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
        .where({ id, environment_id: environmentId, status: 'running' })
        .update({
            status: 'succeeded',
            output,
            result: hasResult ? jsonb(result ?? null) : null,
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
    statuses = ['pending', 'running'],
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
            error: jsonb(error),
            output: output ?? null,
            duration_ms: durationMs ?? null,
            completed_at: trx.fn.now(),
            updated_at: trx.fn.now()
        })
        .returning('*');

    return row || null;
}

export async function timeoutFunctionDryruns({
    limit = 100,
    trx = db.knex
}: {
    limit?: number;
    trx?: Knex;
} = {}): Promise<number> {
    const ids = trx<DBFunctionDryrun>(tableName)
        .select('id')
        .where({ status: 'running' })
        .whereNotNull('execution_timeout_at')
        .where('execution_timeout_at', '<', trx.fn.now())
        .orderBy('execution_timeout_at', 'asc')
        .limit(limit);

    const rows = await trx<DBFunctionDryrun>(tableName)
        .whereIn('id', ids)
        .update({
            status: 'failed',
            error: jsonb({ code: 'timeout', message: 'Dry run timed out' } satisfies FunctionDryrunError),
            completed_at: trx.fn.now(),
            updated_at: trx.fn.now()
        })
        .returning('id');

    return rows.length;
}

export function toFunctionDryrunResult(row: DBFunctionDryrun): FunctionDryrunResultSuccess {
    return toResultResponse(row);
}

function toCreateResponse(row: DBFunctionDryrun): FunctionDryrunCreateSuccess {
    return {
        id: row.id,
        status: row.status === 'running' ? 'running' : 'pending',
        status_url: `/functions/dryruns/${row.id}`,
        created_at: toIsoString(row.created_at),
        ...(row.execution_timeout_at ? { execution_timeout_at: toIsoString(row.execution_timeout_at) } : {})
    };
}

function toResultResponse(row: DBFunctionDryrun): FunctionDryrunResultSuccess {
    return {
        id: row.id,
        status: row.status,
        integration_id: row.request.integration_id,
        function_type: row.request.function_type,
        status_url: `/functions/dryruns/${row.id}`,
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
        ...(row.started_at ? { started_at: toIsoString(row.started_at) } : {}),
        ...(row.completed_at ? { completed_at: toIsoString(row.completed_at) } : {}),
        ...(row.execution_timeout_at ? { execution_timeout_at: toIsoString(row.execution_timeout_at) } : {}),
        ...(row.duration_ms !== null ? { duration_ms: row.duration_ms } : {}),
        ...(row.output !== null ? { output: row.output } : {}),
        ...(row.has_result ? { result: row.result } : {}),
        ...(row.error ? { error: row.error } : {})
    };
}

function toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonb(value: unknown): Knex.Raw {
    return db.knex.raw('?::jsonb', [JSON.stringify(value)]);
}
