import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import {
    createFunctionDeployment,
    createFunctionDryrun,
    deleteFunctionAsyncJobsOlderThan,
    functionAsyncJobsTable,
    getFunctionDeployment,
    getFunctionDeploymentRow,
    getFunctionDryrun,
    getFunctionDryrunRow,
    markFunctionDeploymentFailed,
    markFunctionDeploymentRunning,
    markFunctionDeploymentSuccess,
    markFunctionDryrunFailed,
    markFunctionDryrunRunning,
    markFunctionDryrunSuccess,
    timeoutFunctionAsyncJobs
} from './async-jobs.service.js';
import { remoteFunctionDeploySandboxTimeoutMs, remoteFunctionDryrunSandboxTimeoutMs } from './runtime.js';

import type {
    DBFunctionAsyncJob,
    DBFunctionDeployment,
    DBFunctionDryrun,
    FunctionDeploymentStoredRequest,
    FunctionDryrunStoredRequest
} from './async-jobs.service.js';

const dryrunRequest = {
    integration_id: 'github',
    function_name: 'listRecords',
    function_type: 'sync',
    code: 'export default {}',
    connection_id: 'conn-1'
} satisfies FunctionDryrunStoredRequest;

const deploymentRequest = {
    type: 'function',
    integration_id: 'github',
    function_name: 'listRecords',
    function_type: 'sync',
    code: 'export default {}',
    allow_destructive: false
} satisfies FunctionDeploymentStoredRequest;

describe('function async jobs service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    describe('createFunctionDryrun', () => {
        it('creates a waiting dryrun job and returns a create response', async () => {
            const environmentId = await seedEnvironmentId();

            const created = (await createFunctionDryrun({ environmentId, request: dryrunRequest })).unwrap();

            expect(created.status).toBe('waiting');
            expect(Date.parse(created.created_at)).not.toBeNaN();

            const row = await getFunctionDryrunRow({ environmentId, id: created.id });
            expect(row).toMatchObject({
                id: created.id,
                environment_id: environmentId,
                job_type: 'dryrun',
                request: dryrunRequest,
                status: 'waiting'
            });
        });
    });

    describe('createFunctionDeployment', () => {
        it('creates a waiting deployment job and returns a create response', async () => {
            const environmentId = await seedEnvironmentId();

            const created = (await createFunctionDeployment({ environmentId, request: deploymentRequest })).unwrap();

            expect(created.status).toBe('waiting');
            expect(Date.parse(created.created_at)).not.toBeNaN();

            const row = await getFunctionDeploymentRow({ environmentId, id: created.id });
            expect(row).toMatchObject({
                id: created.id,
                environment_id: environmentId,
                job_type: 'deployment',
                request: deploymentRequest,
                status: 'waiting'
            });
        });
    });

    describe('getFunctionDryrunRow', () => {
        it('returns dryrun rows only', async () => {
            const environmentId = await seedEnvironmentId();
            const dryrun = await insertDryrunJob(environmentId);
            const deployment = await insertDeploymentJob(environmentId);

            expect(await getFunctionDryrunRow({ environmentId, id: dryrun.id })).toMatchObject({ id: dryrun.id, job_type: 'dryrun' });
            expect(await getFunctionDryrunRow({ environmentId, id: deployment.id })).toBeNull();
        });
    });

    describe('getFunctionDeploymentRow', () => {
        it('returns deployment rows only', async () => {
            const environmentId = await seedEnvironmentId();
            const dryrun = await insertDryrunJob(environmentId);
            const deployment = await insertDeploymentJob(environmentId);

            expect(await getFunctionDeploymentRow({ environmentId, id: deployment.id })).toMatchObject({ id: deployment.id, job_type: 'deployment' });
            expect(await getFunctionDeploymentRow({ environmentId, id: dryrun.id })).toBeNull();
        });
    });

    describe('getFunctionDryrun', () => {
        it('returns a dryrun result response', async () => {
            const environmentId = await seedEnvironmentId();
            const completedAt = new Date();
            const dryrun = await insertDryrunJob(environmentId, {
                status: 'success',
                output: 'Dryrun output',
                result: { records: 1 },
                has_result: true,
                duration_ms: 123,
                started_at: new Date(completedAt.getTime() - 1000),
                completed_at: completedAt
            });

            const result = await getFunctionDryrun({ environmentId, id: dryrun.id });

            expect(result).toMatchObject({
                id: dryrun.id,
                status: 'success',
                integration_id: dryrunRequest.integration_id,
                function_type: dryrunRequest.function_type,
                duration_ms: 123,
                output: 'Dryrun output',
                result: { records: 1 }
            });
        });
    });

    describe('getFunctionDeployment', () => {
        it('returns a deployment result response', async () => {
            const environmentId = await seedEnvironmentId();
            const deployedFunctions = [{ name: 'listRecords', version: '1.0.0' }];
            const deployment = await insertDeploymentJob(environmentId, {
                status: 'success',
                output: 'Deployment output',
                result: { deployed: true, deployed_functions: deployedFunctions },
                has_result: true,
                duration_ms: 456,
                completed_at: new Date()
            });

            const result = await getFunctionDeployment({ environmentId, id: deployment.id });

            expect(result).toMatchObject({
                id: deployment.id,
                status: 'success',
                integration_id: deploymentRequest.integration_id,
                function_name: deploymentRequest.function_name,
                function_type: deploymentRequest.function_type,
                duration_ms: 456,
                output: 'Deployment output',
                deployed: true,
                deployed_functions: deployedFunctions
            });
        });
    });

    describe('markFunctionDryrunRunning', () => {
        it('marks a waiting dryrun as running', async () => {
            const environmentId = await seedEnvironmentId();
            const dryrun = await insertDryrunJob(environmentId);
            const startedAt = new Date();
            const executionTimeoutAt = new Date(startedAt.getTime() + remoteFunctionDryrunSandboxTimeoutMs);

            const row = await markFunctionDryrunRunning({
                environmentId,
                id: dryrun.id,
                sandboxId: 'dryrun-sandbox',
                startedAt,
                executionTimeoutAt
            });

            expect(row).toMatchObject({
                id: dryrun.id,
                job_type: 'dryrun',
                status: 'running',
                sandbox_id: 'dryrun-sandbox'
            });
            expect(new Date(row!.started_at!).toISOString()).toBe(startedAt.toISOString());
            expect(new Date(row!.execution_timeout_at!).toISOString()).toBe(executionTimeoutAt.toISOString());
        });
    });

    describe('markFunctionDeploymentRunning', () => {
        it('marks a waiting deployment as running', async () => {
            const environmentId = await seedEnvironmentId();
            const deployment = await insertDeploymentJob(environmentId);
            const startedAt = new Date();
            const executionTimeoutAt = new Date(startedAt.getTime() + remoteFunctionDeploySandboxTimeoutMs);

            const row = await markFunctionDeploymentRunning({
                environmentId,
                id: deployment.id,
                sandboxId: 'deployment-sandbox',
                startedAt,
                executionTimeoutAt
            });

            expect(row).toMatchObject({
                id: deployment.id,
                job_type: 'deployment',
                status: 'running',
                sandbox_id: 'deployment-sandbox'
            });
            expect(new Date(row!.started_at!).toISOString()).toBe(startedAt.toISOString());
            expect(new Date(row!.execution_timeout_at!).toISOString()).toBe(executionTimeoutAt.toISOString());
        });
    });

    describe('markFunctionDryrunSuccess', () => {
        it('marks a dryrun as successful', async () => {
            const environmentId = await seedEnvironmentId();
            const dryrun = await insertDryrunJob(environmentId, { status: 'running' });

            const row = await markFunctionDryrunSuccess({
                environmentId,
                id: dryrun.id,
                output: 'Dryrun output',
                result: { ok: true },
                hasResult: true,
                durationMs: 321
            });

            expect(row).toMatchObject({
                id: dryrun.id,
                job_type: 'dryrun',
                status: 'success',
                output: 'Dryrun output',
                result: { ok: true },
                has_result: true,
                duration_ms: 321
            });
            expect(row!.completed_at).not.toBeNull();
        });
    });

    describe('markFunctionDeploymentSuccess', () => {
        it('marks a deployment as successful', async () => {
            const environmentId = await seedEnvironmentId();
            const deployment = await insertDeploymentJob(environmentId, { status: 'running' });
            const deployedFunctions = [{ name: 'listRecords', version: '1.0.0' }];

            const row = await markFunctionDeploymentSuccess({
                environmentId,
                id: deployment.id,
                output: 'Deployment output',
                deployed: true,
                deployedFunctions,
                durationMs: 654
            });

            expect(row).toMatchObject({
                id: deployment.id,
                job_type: 'deployment',
                status: 'success',
                output: 'Deployment output',
                result: { deployed: true, deployed_functions: deployedFunctions },
                has_result: true,
                duration_ms: 654
            });
            expect(row!.completed_at).not.toBeNull();
        });
    });

    describe('markFunctionDryrunFailed', () => {
        it('marks a dryrun as failed', async () => {
            const environmentId = await seedEnvironmentId();
            const dryrun = await insertDryrunJob(environmentId, { status: 'running' });

            const row = await markFunctionDryrunFailed({
                environmentId,
                id: dryrun.id,
                error: { code: 'dryrun_error', message: 'Dry run failed' },
                output: 'Dryrun failed output',
                durationMs: 111
            });

            expect(row).toMatchObject({
                id: dryrun.id,
                job_type: 'dryrun',
                status: 'failed',
                error: { code: 'dryrun_error', message: 'Dry run failed' },
                output: 'Dryrun failed output',
                duration_ms: 111
            });
            expect(row!.completed_at).not.toBeNull();
        });
    });

    describe('markFunctionDeploymentFailed', () => {
        it('marks a deployment as failed', async () => {
            const environmentId = await seedEnvironmentId();
            const deployment = await insertDeploymentJob(environmentId, { status: 'running' });

            const row = await markFunctionDeploymentFailed({
                environmentId,
                id: deployment.id,
                error: { code: 'deployment_error', message: 'Deployment failed' },
                output: 'Deployment failed output',
                durationMs: 222
            });

            expect(row).toMatchObject({
                id: deployment.id,
                job_type: 'deployment',
                status: 'failed',
                error: { code: 'deployment_error', message: 'Deployment failed' },
                output: 'Deployment failed output',
                duration_ms: 222
            });
            expect(row!.completed_at).not.toBeNull();
        });
    });

    describe('timeoutFunctionAsyncJobs', () => {
        it('does not overwrite dryruns completed while timing out running dryruns', async () => {
            const environmentId = await seedEnvironmentId();
            const dryrun = await insertDryrunJob(environmentId, {
                status: 'running',
                sandbox_id: `sandbox-${randomUUID()}`,
                started_at: new Date(Date.now() - 2 * 60 * 1000),
                execution_timeout_at: new Date(Date.now() - 60 * 1000)
            });

            const trx = await db.knex.transaction();
            let transactionClosed = false;
            try {
                await trx<DBFunctionDryrun>(functionAsyncJobsTable).where({ id: dryrun.id }).update({
                    status: 'success',
                    output: 'done',
                    completed_at: trx.fn.now(),
                    updated_at: trx.fn.now()
                });

                const timedOutPromise = timeoutFunctionAsyncJobs();
                await new Promise((resolve) => setTimeout(resolve, 100));
                await trx.commit();
                transactionClosed = true;

                await timedOutPromise;
            } catch (err) {
                if (!transactionClosed) {
                    await trx.rollback();
                }
                throw err;
            }

            const row = await db.knex<DBFunctionDryrun>(functionAsyncJobsTable).where({ id: dryrun.id }).first();
            expect(row?.status).toBe('success');
            expect(row?.error).toBeNull();
        });

        it('times out waiting dryruns older than the sandbox timeout', async () => {
            const environmentId = await seedEnvironmentId();
            const oldDryrun = await insertDryrunJob(environmentId, {
                request: { ...dryrunRequest, function_name: 'old-function' },
                status: 'waiting',
                created_at: new Date(Date.now() - remoteFunctionDryrunSandboxTimeoutMs - 60_000)
            });
            const recentDryrun = await insertDryrunJob(environmentId, {
                request: { ...dryrunRequest, function_name: 'recent-function' },
                status: 'waiting',
                created_at: new Date(Date.now() - remoteFunctionDryrunSandboxTimeoutMs + 60_000)
            });

            await timeoutFunctionAsyncJobs();

            const updatedRows = await db.knex<DBFunctionDryrun>(functionAsyncJobsTable).whereIn('id', [oldDryrun.id, recentDryrun.id]);
            const updatedOldDryrun = updatedRows.find((row) => row.id === oldDryrun.id);
            const updatedRecentDryrun = updatedRows.find((row) => row.id === recentDryrun.id);

            expect(updatedOldDryrun?.status).toBe('failed');
            expect(updatedOldDryrun?.error).toStrictEqual({ code: 'timeout', message: 'Dry run timed out' });
            expect(updatedRecentDryrun?.status).toBe('waiting');
            expect(updatedRecentDryrun?.error).toBeNull();
        });

        it('times out waiting deployments older than the sandbox timeout', async () => {
            const environmentId = await seedEnvironmentId();
            const oldDeployment = await insertDeploymentJob(environmentId, {
                request: { ...deploymentRequest, function_name: 'old-function' },
                status: 'waiting',
                created_at: new Date(Date.now() - remoteFunctionDeploySandboxTimeoutMs - 60_000)
            });
            const recentDeployment = await insertDeploymentJob(environmentId, {
                request: { ...deploymentRequest, function_name: 'recent-function' },
                status: 'waiting',
                created_at: new Date(Date.now() - remoteFunctionDeploySandboxTimeoutMs + 60_000)
            });

            await timeoutFunctionAsyncJobs();

            const updatedRows = await db.knex<DBFunctionDeployment>(functionAsyncJobsTable).whereIn('id', [oldDeployment.id, recentDeployment.id]);
            const updatedOldDeployment = updatedRows.find((row) => row.id === oldDeployment.id);
            const updatedRecentDeployment = updatedRows.find((row) => row.id === recentDeployment.id);

            expect(updatedOldDeployment?.status).toBe('failed');
            expect(updatedOldDeployment?.error).toStrictEqual({ code: 'timeout', message: 'Deployment timed out' });
            expect(updatedRecentDeployment?.status).toBe('waiting');
            expect(updatedRecentDeployment?.error).toBeNull();
        });
    });

    describe('deleteFunctionAsyncJobsOlderThan', () => {
        it('deletes async jobs older than the retention period', async () => {
            const environmentId = await seedEnvironmentId();
            const oldCreatedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
            const recentCreatedAt = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
            const oldDryrun = await insertDryrunJob(environmentId, { status: 'failed', created_at: oldCreatedAt });
            const oldDeployment = await insertDeploymentJob(environmentId, { status: 'failed', created_at: oldCreatedAt });
            const recentDryrun = await insertDryrunJob(environmentId, { status: 'failed', created_at: recentCreatedAt });

            await deleteFunctionAsyncJobsOlderThan({ olderThanDays: 14 });

            const remainingRows = await db
                .knex<DBFunctionAsyncJob>(functionAsyncJobsTable)
                .whereIn('id', [oldDryrun.id, oldDeployment.id, recentDryrun.id])
                .orderBy('id');

            expect(remainingRows.map((row) => row.id)).toStrictEqual([recentDryrun.id]);
        });
    });
});

async function seedEnvironmentId(): Promise<number> {
    const { env } = await seeders.seedAccountEnvAndUser();
    return env.id;
}

async function insertDryrunJob(environmentId: number, overrides: Partial<DBFunctionDryrun> = {}): Promise<DBFunctionDryrun> {
    const [row] = await db
        .knex<DBFunctionDryrun>(functionAsyncJobsTable)
        .insert({
            environment_id: environmentId,
            job_type: 'dryrun',
            request: dryrunRequest,
            status: 'waiting',
            ...overrides
        })
        .returning('*');

    expect(row).toBeDefined();
    return row!;
}

async function insertDeploymentJob(environmentId: number, overrides: Partial<DBFunctionDeployment> = {}): Promise<DBFunctionDeployment> {
    const [row] = await db
        .knex<DBFunctionDeployment>(functionAsyncJobsTable)
        .insert({
            environment_id: environmentId,
            job_type: 'deployment',
            request: deploymentRequest,
            status: 'waiting',
            ...overrides
        })
        .returning('*');

    expect(row).toBeDefined();
    return row!;
}
