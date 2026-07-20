import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { createFunctionDeployment, deploySandboxTimeoutMs, functionAsyncJobsTable } from '@nangohq/sandbox';
import { seeders } from '@nangohq/shared';

import { destroyTimeoutFunctionAsyncJobsCron, exec } from './timeoutFunctionAsyncJobs.js';

import type { DBFunctionDeployment, FunctionDeploymentStoredRequest } from '@nangohq/sandbox';

const deploymentRequest = {
    type: 'function',
    integration_id: 'github',
    function_name: 'listRecords',
    function_type: 'sync',
    code: 'export default {}',
    allow_destructive: false
} satisfies FunctionDeploymentStoredRequest;

describe('timeoutFunctionAsyncJobs cron', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterAll(async () => {
        await destroyTimeoutFunctionAsyncJobsCron();
    });

    it('times out async jobs even when the default database pool is exhausted', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const deployment = (await createFunctionDeployment({ environmentId: env.id, request: deploymentRequest })).unwrap();

        await db.knex<DBFunctionDeployment>(functionAsyncJobsTable)
            .where({ id: deployment.id })
            .update({ created_at: new Date(Date.now() - deploySandboxTimeoutMs - 60_000) });

        const poolMax = Number(process.env['NANGO_DB_POOL_MAX'] || 30);
        const blockingTransactions = await Promise.all(Array.from({ length: poolMax }, () => db.knex.transaction()));

        try {
            await exec();
        } finally {
            await Promise.all(blockingTransactions.map((trx) => trx.rollback()));
        }

        const row = await db.knex<DBFunctionDeployment>(functionAsyncJobsTable).where({ id: deployment.id }).first();

        expect(row?.status).toBe('failed');
        expect(row?.error).toStrictEqual({ code: 'timeout', message: 'Deployment timed out' });
    });
});
