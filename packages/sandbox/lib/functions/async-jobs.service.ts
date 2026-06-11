import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import { remoteFunctionDeploySandboxTimeoutMs, remoteFunctionDryrunSandboxTimeoutMs } from './runtime.js';

import type {
    FunctionAsyncJobStatus,
    FunctionDeploymentBody,
    FunctionDeploymentCreateSuccess,
    FunctionDeploymentResultSuccess,
    FunctionDryrunBody,
    FunctionDryrunCreateSuccess,
    FunctionDryrunResultSuccess,
    FunctionErrorCode,
    Result
} from '@nangohq/types';
import type { Knex } from 'knex';

export const functionAsyncJobsTable = 'function_async_jobs';

const dryrunTimeoutError = { code: 'timeout', message: 'Dry run timed out' } satisfies FunctionAsyncJobError;
const deploymentTimeoutError = { code: 'timeout', message: 'Deployment timed out' } satisfies FunctionAsyncJobError;

export type FunctionAsyncJobType = 'dryrun' | 'deployment';

export interface FunctionDryrunStoredRequest extends FunctionDryrunBody {
    function_name: string;
}

export type FunctionDeploymentStoredRequest = FunctionDeploymentBody;

export type FunctionAsyncJobStoredRequest = FunctionDryrunStoredRequest | FunctionDeploymentStoredRequest;

export interface FunctionAsyncJobError {
    code: FunctionErrorCode;
    message: string;
    payload?: unknown;
}

export interface DBFunctionAsyncJob<Request = FunctionAsyncJobStoredRequest> {
    id: string;
    environment_id: number;
    job_type: FunctionAsyncJobType;
    request: Request;
    status: FunctionAsyncJobStatus;
    sandbox_id: string | null;
    output: string | null;
    result: unknown;
    has_result: boolean;
    error: FunctionAsyncJobError | null;
    duration_ms: number | null;
    execution_timeout_at: Date | string | null;
    started_at: Date | string | null;
    completed_at: Date | string | null;
    created_at: Date | string;
    updated_at: Date | string;
}

export type DBFunctionDryrun = DBFunctionAsyncJob<FunctionDryrunStoredRequest> & { job_type: 'dryrun' };
export type DBFunctionDeployment = DBFunctionAsyncJob<FunctionDeploymentStoredRequest> & { job_type: 'deployment' };
export type FunctionDryrunError = FunctionAsyncJobError;
export type FunctionDeploymentError = FunctionAsyncJobError;

export async function createFunctionDryrun({
    environmentId,
    request,
    trx = db.knex
}: {
    environmentId: number;
    request: FunctionDryrunStoredRequest;
    trx?: Knex;
}): Promise<Result<FunctionDryrunCreateSuccess>> {
    const job = await createFunctionAsyncJob({ environmentId, jobType: 'dryrun', request, trx });
    if (job.isErr()) {
        return Err(job.error);
    }

    return Ok(toFunctionDryrunCreate(job.value as DBFunctionDryrun));
}

export async function createFunctionDeployment({
    environmentId,
    request,
    trx = db.knex
}: {
    environmentId: number;
    request: FunctionDeploymentStoredRequest;
    trx?: Knex;
}): Promise<Result<FunctionDeploymentCreateSuccess>> {
    const job = await createFunctionAsyncJob({ environmentId, jobType: 'deployment', request, trx });
    if (job.isErr()) {
        return Err(job.error);
    }

    return Ok(toFunctionDeploymentCreate(job.value as DBFunctionDeployment));
}

async function createFunctionAsyncJob<Request extends FunctionAsyncJobStoredRequest>({
    environmentId,
    jobType,
    request,
    trx = db.knex
}: {
    environmentId: number;
    jobType: FunctionAsyncJobType;
    request: Request;
    trx?: Knex;
}): Promise<Result<DBFunctionAsyncJob<Request>>> {
    try {
        const [row] = await trx<DBFunctionAsyncJob<Request>>(functionAsyncJobsTable)
            .insert({
                environment_id: environmentId,
                job_type: jobType,
                request: jsonb(trx, request),
                status: 'waiting'
            })
            .returning('*');

        if (!row) {
            return Err(new Error(`Failed to create function ${jobType} job`));
        }

        return Ok(row);
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
    const row = await getFunctionAsyncJobRow<FunctionDryrunStoredRequest>({ environmentId, id, jobType: 'dryrun', trx });
    return row ? (row as DBFunctionDryrun) : null;
}

export async function getFunctionDeploymentRow({
    environmentId,
    id,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    trx?: Knex;
}): Promise<DBFunctionDeployment | null> {
    const row = await getFunctionAsyncJobRow<FunctionDeploymentStoredRequest>({ environmentId, id, jobType: 'deployment', trx });
    return row ? (row as DBFunctionDeployment) : null;
}

async function getFunctionAsyncJobRow<Request extends FunctionAsyncJobStoredRequest>({
    environmentId,
    id,
    jobType,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    jobType: FunctionAsyncJobType;
    trx?: Knex;
}): Promise<DBFunctionAsyncJob<Request> | null> {
    const row = await trx<DBFunctionAsyncJob<Request>>(functionAsyncJobsTable).where({ id, environment_id: environmentId, job_type: jobType }).first();
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

export async function getFunctionDeployment({
    environmentId,
    id,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    trx?: Knex;
}): Promise<FunctionDeploymentResultSuccess | null> {
    const row = await getFunctionDeploymentRow({ environmentId, id, trx });
    return row ? toFunctionDeploymentResult(row) : null;
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
    const row = await markFunctionAsyncJobRunning({ environmentId, id, jobType: 'dryrun', sandboxId, startedAt, executionTimeoutAt, trx });
    return row ? (row as DBFunctionDryrun) : null;
}

export async function markFunctionDeploymentRunning({
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
}): Promise<DBFunctionDeployment | null> {
    const row = await markFunctionAsyncJobRunning({ environmentId, id, jobType: 'deployment', sandboxId, startedAt, executionTimeoutAt, trx });
    return row ? (row as DBFunctionDeployment) : null;
}

async function markFunctionAsyncJobRunning({
    environmentId,
    id,
    jobType,
    sandboxId,
    startedAt,
    executionTimeoutAt,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    jobType: FunctionAsyncJobType;
    sandboxId: string;
    startedAt: Date;
    executionTimeoutAt: Date;
    trx?: Knex;
}): Promise<DBFunctionAsyncJob | null> {
    const [row] = await trx<DBFunctionAsyncJob>(functionAsyncJobsTable)
        .where({ id, environment_id: environmentId, job_type: jobType, status: 'waiting' })
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
    const row = await markFunctionAsyncJobSuccess({
        environmentId,
        id,
        jobType: 'dryrun',
        output,
        result,
        hasResult,
        durationMs,
        trx
    });
    return row ? (row as DBFunctionDryrun) : null;
}

export async function markFunctionDeploymentSuccess({
    environmentId,
    id,
    output,
    deployed,
    deployedFunctions,
    durationMs,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    output: string;
    deployed: boolean;
    deployedFunctions: { name: string; version: string }[];
    durationMs?: number | undefined;
    trx?: Knex;
}): Promise<DBFunctionDeployment | null> {
    const row = await markFunctionAsyncJobSuccess({
        environmentId,
        id,
        jobType: 'deployment',
        output,
        result: { deployed, deployed_functions: deployedFunctions },
        hasResult: true,
        durationMs,
        trx
    });
    return row ? (row as DBFunctionDeployment) : null;
}

async function markFunctionAsyncJobSuccess({
    environmentId,
    id,
    jobType,
    output,
    result,
    hasResult,
    durationMs,
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    jobType: FunctionAsyncJobType;
    output: string;
    result?: unknown;
    hasResult: boolean;
    durationMs?: number | undefined;
    trx?: Knex;
}): Promise<DBFunctionAsyncJob | null> {
    const [row] = await trx<DBFunctionAsyncJob>(functionAsyncJobsTable)
        .where({ id, environment_id: environmentId, job_type: jobType })
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
    error: FunctionAsyncJobError;
    output?: string | undefined;
    durationMs?: number | undefined;
    statuses?: FunctionAsyncJobStatus[] | undefined;
    trx?: Knex;
}): Promise<DBFunctionDryrun | null> {
    const row = await markFunctionAsyncJobFailed({ environmentId, id, jobType: 'dryrun', error, output, durationMs, statuses, trx });
    return row ? (row as DBFunctionDryrun) : null;
}

export async function markFunctionDeploymentFailed({
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
    error: FunctionAsyncJobError;
    output?: string | undefined;
    durationMs?: number | undefined;
    statuses?: FunctionAsyncJobStatus[] | undefined;
    trx?: Knex;
}): Promise<DBFunctionDeployment | null> {
    const row = await markFunctionAsyncJobFailed({ environmentId, id, jobType: 'deployment', error, output, durationMs, statuses, trx });
    return row ? (row as DBFunctionDeployment) : null;
}

async function markFunctionAsyncJobFailed({
    environmentId,
    id,
    jobType,
    error,
    output,
    durationMs,
    statuses = ['waiting', 'running'],
    trx = db.knex
}: {
    environmentId: number;
    id: string;
    jobType: FunctionAsyncJobType;
    error: FunctionAsyncJobError;
    output?: string | undefined;
    durationMs?: number | undefined;
    statuses?: FunctionAsyncJobStatus[] | undefined;
    trx?: Knex;
}): Promise<DBFunctionAsyncJob | null> {
    const [row] = await trx<DBFunctionAsyncJob>(functionAsyncJobsTable)
        .where({ id, environment_id: environmentId, job_type: jobType })
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

export async function timeoutFunctionAsyncJobs({ limit = 100, trx }: { limit?: number; trx?: Knex.Transaction } = {}): Promise<number> {
    const updateTimedOutJobs = async (transaction: Knex.Transaction): Promise<number> => {
        const dryrunWaitingTimeoutThreshold = transaction.raw("CURRENT_TIMESTAMP - (? * INTERVAL '1 millisecond')", [remoteFunctionDryrunSandboxTimeoutMs]);
        const deploymentWaitingTimeoutThreshold = transaction.raw("CURRENT_TIMESTAMP - (? * INTERVAL '1 millisecond')", [remoteFunctionDeploySandboxTimeoutMs]);

        // Hold locks through the update so a sandbox callback completing the row is not overwritten.
        const candidates = await transaction<DBFunctionAsyncJob>(functionAsyncJobsTable)
            .select('id')
            .where((query) => {
                query
                    .where((running) => {
                        running.where({ status: 'running' }).whereNotNull('execution_timeout_at').where('execution_timeout_at', '<', transaction.fn.now());
                    })
                    .orWhere((waiting) => {
                        waiting.where({ status: 'waiting' }).where((byType) => {
                            byType
                                .where((dryrun) => {
                                    dryrun.where({ job_type: 'dryrun' }).where('created_at', '<', dryrunWaitingTimeoutThreshold);
                                })
                                .orWhere((deployment) => {
                                    deployment.where({ job_type: 'deployment' }).where('created_at', '<', deploymentWaitingTimeoutThreshold);
                                });
                        });
                    });
            })
            .orderByRaw('COALESCE(execution_timeout_at, created_at) ASC')
            .limit(limit)
            .forUpdate()
            .skipLocked();

        if (candidates.length === 0) {
            return 0;
        }

        const rows = await transaction<DBFunctionAsyncJob>(functionAsyncJobsTable)
            .whereIn('status', ['waiting', 'running'])
            .whereIn(
                'id',
                candidates.map((candidate) => candidate.id)
            )
            .update({
                status: 'failed',
                error: transaction.raw('CASE WHEN job_type = ? THEN ?::jsonb ELSE ?::jsonb END', [
                    'deployment',
                    JSON.stringify(deploymentTimeoutError),
                    JSON.stringify(dryrunTimeoutError)
                ]),
                completed_at: transaction.fn.now(),
                updated_at: transaction.fn.now()
            })
            .returning('id');

        return rows.length;
    };

    return trx ? updateTimedOutJobs(trx) : db.knex.transaction(updateTimedOutJobs);
}

export async function deleteFunctionAsyncJobsOlderThan({
    limit = 1000,
    olderThanDays = 14,
    trx = db.knex
}: {
    limit?: number;
    olderThanDays?: number;
    trx?: Knex;
} = {}): Promise<number> {
    const cutoff = trx.raw("CURRENT_TIMESTAMP - (? * INTERVAL '1 day')", [olderThanDays]);
    const ids = trx<DBFunctionAsyncJob>(functionAsyncJobsTable).select('id').where('created_at', '<', cutoff).orderBy('created_at', 'asc').limit(limit);
    const rows = await trx<DBFunctionAsyncJob>(functionAsyncJobsTable).whereIn('id', ids).delete().returning('id');

    return rows.length;
}

export function toFunctionDryrunCreate(row: DBFunctionDryrun): FunctionDryrunCreateSuccess {
    if (row.job_type !== 'dryrun') {
        throw new Error(`Cannot create function dryrun response for '${row.job_type}' job`);
    }
    if (row.status !== 'waiting' && row.status !== 'running') {
        throw new Error(`Cannot create function dryrun response for '${row.status}' dryrun`);
    }

    return {
        id: row.id,
        status: row.status,
        created_at: toIsoString(row.created_at)
    };
}

export function toFunctionDeploymentCreate(row: DBFunctionDeployment): FunctionDeploymentCreateSuccess {
    if (row.job_type !== 'deployment') {
        throw new Error(`Cannot create function deployment response for '${row.job_type}' job`);
    }
    if (row.status !== 'waiting' && row.status !== 'running') {
        throw new Error(`Cannot create function deployment response for '${row.status}' deployment`);
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

export function toFunctionDeploymentResult(row: DBFunctionDeployment): FunctionDeploymentResultSuccess {
    const deploymentResult = row.has_result ? parseDeploymentResult(row.result) : null;

    return {
        id: row.id,
        status: row.status,
        integration_id: row.request.integration_id,
        function_name: row.request.function_name,
        function_type: row.request.function_type,
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
        ...(row.started_at ? { started_at: toIsoString(row.started_at) } : {}),
        ...(row.completed_at ? { completed_at: toIsoString(row.completed_at) } : {}),
        ...(row.duration_ms !== null ? { duration_ms: row.duration_ms } : {}),
        ...(row.output !== null ? { output: row.output } : {}),
        ...(deploymentResult ? { deployed: deploymentResult.deployed, deployed_functions: deploymentResult.deployed_functions } : {}),
        ...(row.error ? { error: row.error } : {})
    };
}

function parseDeploymentResult(value: unknown): { deployed: boolean; deployed_functions: { name: string; version: string }[] } | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const result = value as Record<string, unknown>;
    if (typeof result['deployed'] !== 'boolean' || !Array.isArray(result['deployed_functions'])) {
        return null;
    }

    const deployedFunctions = result['deployed_functions'];
    if (
        !deployedFunctions.every((deployedFunction): deployedFunction is { name: string; version: string } => {
            return (
                Boolean(deployedFunction) &&
                typeof deployedFunction === 'object' &&
                typeof (deployedFunction as Record<string, unknown>)['name'] === 'string' &&
                typeof (deployedFunction as Record<string, unknown>)['version'] === 'string'
            );
        })
    ) {
        return null;
    }

    return {
        deployed: result['deployed'],
        deployed_functions: deployedFunctions
    };
}

function toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonb(trx: Knex, value: unknown): Knex.Raw {
    return trx.raw('?::jsonb', [JSON.stringify(value)]);
}
