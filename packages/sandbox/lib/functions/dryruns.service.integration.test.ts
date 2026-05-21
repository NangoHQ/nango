import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { timeoutFunctionDryruns } from './dryruns.service.js';

import type { DBFunctionDryrun } from './dryruns.service.js';

const tableName = 'function_dryruns';

describe('function dryruns service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('does not overwrite dryruns completed while timing out running dryruns', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const [dryrun] = await db
            .knex<DBFunctionDryrun>(tableName)
            .insert({
                environment_id: env.id,
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

            const timedOutPromise = timeoutFunctionDryruns();
            await new Promise((resolve) => setTimeout(resolve, 100));
            await trx.commit();
            transactionClosed = true;

            await expect(timedOutPromise).resolves.toBe(0);
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
});
