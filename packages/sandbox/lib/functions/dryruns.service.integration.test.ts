import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { deleteFunctionAsyncJobsOlderThan, timeoutFunctionAsyncJobs } from './async-jobs.service.js';
import { remoteFunctionDeploySandboxTimeoutMs, remoteFunctionDryrunSandboxTimeoutMs } from './runtime.js';

import type { DBFunctionAsyncJob, DBFunctionDeployment, DBFunctionDryrun } from './async-jobs.service.js';

const tableName = 'function_async_jobs';

describe('function async jobs service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('does not overwrite dryruns completed while timing out running dryruns', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const [dryrun] = await db
            .knex<DBFunctionDryrun>(tableName)
            .insert({
                environment_id: env.id,
                job_type: 'dryrun',
                request: {
                    integration_id: 'github',
                    function_name: 'function',
                    function_type: 'sync',
                    code: 'export default {}',
                    connection_id: 'conn'
                },
                status: 'running',
                sandbox_id: `sandbox-${randomUUID()}`,
                started_at: new Date(Date.now() - 2 * 60 * 1000),
                execution_timeout_at: new Date(Date.now() - 60 * 1000)
            })
            .returning('*');
        expect(dryrun).toBeDefined();

        const trx = await db.knex.transaction();
        let transactionClosed = false;
        try {
            await trx<DBFunctionDryrun>(tableName).where({ id: dryrun!.id }).update({
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

        const row = await db.knex<DBFunctionDryrun>(tableName).where({ id: dryrun!.id }).first();
        expect(row?.status).toBe('success');
        expect(row?.error).toBeNull();
    });

    it('times out waiting dryruns older than the sandbox timeout', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const oldCreatedAt = new Date(Date.now() - remoteFunctionDryrunSandboxTimeoutMs - 60_000);
        const recentCreatedAt = new Date(Date.now() - remoteFunctionDryrunSandboxTimeoutMs + 60_000);
        const rows = await db
            .knex<DBFunctionDryrun>(tableName)
            .insert([
                {
                    environment_id: env.id,
                    job_type: 'dryrun',
                    request: {
                        integration_id: 'github',
                        function_name: 'old-function',
                        function_type: 'sync',
                        code: 'export default {}',
                        connection_id: 'conn'
                    },
                    status: 'waiting',
                    created_at: oldCreatedAt
                },
                {
                    environment_id: env.id,
                    job_type: 'dryrun',
                    request: {
                        integration_id: 'github',
                        function_name: 'recent-function',
                        function_type: 'sync',
                        code: 'export default {}',
                        connection_id: 'conn'
                    },
                    status: 'waiting',
                    created_at: recentCreatedAt
                }
            ])
            .returning('*');
        const [oldDryrun, recentDryrun] = rows;
        expect(oldDryrun).toBeDefined();
        expect(recentDryrun).toBeDefined();

        await timeoutFunctionAsyncJobs();

        const updatedRows = await db.knex<DBFunctionDryrun>(tableName).whereIn('id', [oldDryrun!.id, recentDryrun!.id]);
        const updatedOldDryrun = updatedRows.find((row) => row.id === oldDryrun!.id);
        const updatedRecentDryrun = updatedRows.find((row) => row.id === recentDryrun!.id);

        expect(updatedOldDryrun?.status).toBe('failed');
        expect(updatedOldDryrun?.error).toStrictEqual({ code: 'timeout', message: 'Dry run timed out' });
        expect(updatedRecentDryrun?.status).toBe('waiting');
        expect(updatedRecentDryrun?.error).toBeNull();
    });

    it('times out waiting deployments older than the sandbox timeout', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const oldCreatedAt = new Date(Date.now() - remoteFunctionDeploySandboxTimeoutMs - 60_000);
        const recentCreatedAt = new Date(Date.now() - remoteFunctionDeploySandboxTimeoutMs + 60_000);
        const rows = await db
            .knex<DBFunctionDeployment>(tableName)
            .insert([
                {
                    environment_id: env.id,
                    job_type: 'deployment',
                    request: {
                        type: 'function',
                        integration_id: 'github',
                        function_name: 'old-function',
                        function_type: 'sync',
                        code: 'export default {}',
                        allow_destructive: false
                    },
                    status: 'waiting',
                    created_at: oldCreatedAt
                },
                {
                    environment_id: env.id,
                    job_type: 'deployment',
                    request: {
                        type: 'function',
                        integration_id: 'github',
                        function_name: 'recent-function',
                        function_type: 'sync',
                        code: 'export default {}',
                        allow_destructive: false
                    },
                    status: 'waiting',
                    created_at: recentCreatedAt
                }
            ])
            .returning('*');
        const [oldDeployment, recentDeployment] = rows;
        expect(oldDeployment).toBeDefined();
        expect(recentDeployment).toBeDefined();

        await timeoutFunctionAsyncJobs();

        const updatedRows = await db.knex<DBFunctionAsyncJob>(tableName).whereIn('id', [oldDeployment!.id, recentDeployment!.id]);
        const updatedOldDeployment = updatedRows.find((row) => row.id === oldDeployment!.id);
        const updatedRecentDeployment = updatedRows.find((row) => row.id === recentDeployment!.id);

        expect(updatedOldDeployment?.status).toBe('failed');
        expect(updatedOldDeployment?.error).toStrictEqual({ code: 'timeout', message: 'Deployment timed out' });
        expect(updatedRecentDeployment?.status).toBe('waiting');
        expect(updatedRecentDeployment?.error).toBeNull();
    });

    it('deletes dryruns older than the retention period', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const oldCreatedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
        const recentCreatedAt = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
        const rows = await db
            .knex<DBFunctionDryrun>(tableName)
            .insert([
                {
                    environment_id: env.id,
                    job_type: 'dryrun',
                    request: {
                        integration_id: 'github',
                        function_name: 'old-function',
                        function_type: 'sync',
                        code: 'export default {}',
                        connection_id: 'conn'
                    },
                    status: 'failed',
                    created_at: oldCreatedAt
                },
                {
                    environment_id: env.id,
                    job_type: 'dryrun',
                    request: {
                        integration_id: 'github',
                        function_name: 'recent-function',
                        function_type: 'sync',
                        code: 'export default {}',
                        connection_id: 'conn'
                    },
                    status: 'failed',
                    created_at: recentCreatedAt
                }
            ])
            .returning('*');
        const [oldDryrun, recentDryrun] = rows;
        expect(oldDryrun).toBeDefined();
        expect(recentDryrun).toBeDefined();

        await deleteFunctionAsyncJobsOlderThan({ olderThanDays: 14 });

        const remainingRows = await db.knex<DBFunctionDryrun>(tableName).whereIn('id', [oldDryrun!.id, recentDryrun!.id]);

        expect(remainingRows.map((row) => row.id)).toStrictEqual([recentDryrun!.id]);
    });
});
