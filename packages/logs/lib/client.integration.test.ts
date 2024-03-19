import { describe, beforeAll, it, expect } from 'vitest';
import { getOperationContext } from './client';
import { migrate, createPartitions } from './db/helpers';
import { getOperation, listOperations } from './models/operations';
import { db } from './db/client';
import { listMessages } from './models/messages';
import type { OperationRequired } from './types/operations';

const operationPayload: OperationRequired = { account_id: '1234', account_name: 'test', environment_id: '5678', environment_name: 'dev', type: 'sync' };

describe('client', () => {
    beforeAll(async () => {
        await migrate();
        await createPartitions();
        await db.table('operations').truncate();
    });

    it('should insert an operation', async () => {
        const ctx = await getOperationContext(operationPayload);
        expect(ctx).toMatchObject({ operationId: expect.toBeUUID() });

        const list = await listOperations({ limit: 1 });
        expect(list).toStrictEqual([
            {
                account_id: 1234,
                account_name: 'test',
                code: null,
                config_id: null,
                config_name: null,
                connection_id: null,
                connection_name: null,
                created_at: expect.toBeIsoDate(),
                ended_at: null,
                environment_id: 5678,
                environment_name: 'dev',
                id: ctx.operationId,
                job_id: null,
                level: 'info',
                started_at: null,
                state: 'waiting',
                sync_id: null,
                sync_name: null,
                title: null,
                type: 'sync',
                updated_at: expect.toBeIsoDate(),
                user_id: null
            }
        ]);
    });

    describe('general state', () => {
        it('should set operation as started', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.start();

            const operation = await getOperation({ id: ctx.operationId });

            expect(operation).toMatchObject({
                id: ctx.operationId,
                level: 'info',
                state: 'running',
                started_at: expect.toBeIsoDate(),
                ended_at: null
            });
        });

        it('should set operation as cancelled', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.cancel();

            const operation = await getOperation({ id: ctx.operationId });

            expect(operation).toMatchObject({
                id: ctx.operationId,
                level: 'info',
                state: 'cancelled',
                started_at: expect.toBeIsoDate(),
                ended_at: null
            });
        });

        it('should set operation as timeout', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.timeout();

            const operation = await getOperation({ id: ctx.operationId });

            expect(operation).toMatchObject({
                id: ctx.operationId,
                level: 'info',
                state: 'timeout',
                started_at: expect.toBeIsoDate(),
                ended_at: null
            });
        });

        it('should set operation as finished', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.finish();

            const operation = await getOperation({ id: ctx.operationId });

            expect(operation).toMatchObject({
                id: ctx.operationId,
                level: 'info',
                state: 'success',
                started_at: expect.toBeIsoDate(),
                ended_at: expect.toBeIsoDate()
            });
        });
    });

    describe('failed', () => {
        it('should set operation as failed', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.failed();

            const operation = await getOperation({ id: ctx.operationId });

            expect(operation).toMatchObject({
                id: ctx.operationId,
                level: 'info',
                state: 'failed',
                started_at: expect.toBeIsoDate(),
                ended_at: null
            });
        });

        it('should set operation as failed and finished', async () => {
            const ctx = await getOperationContext({ account_id: '1234', account_name: 'test', environment_id: '5678', environment_name: 'dev', type: 'sync' });
            await ctx.failed();
            await ctx.finish();

            const operation = await getOperation({ id: ctx.operationId });

            expect(operation).toMatchObject({
                id: ctx.operationId,
                level: 'info',
                state: 'failed',
                started_at: expect.toBeIsoDate(),
                ended_at: expect.toBeIsoDate()
            });
        });
    });

    describe('log type', () => {
        it('should log all types', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.trace('trace msg');
            await ctx.debug('debug msg');
            await ctx.info('info msg');
            await ctx.warn('warn msg');
            await ctx.error('error msg');

            const list = await listMessages({ operationId: ctx.operationId, limit: 5 });
            expect(list).toMatchObject([
                { operation_id: ctx.operationId, content: { level: 'trace', msg: 'trace msg' } },
                { operation_id: ctx.operationId, content: { level: 'debug', msg: 'debug msg' } },
                { operation_id: ctx.operationId, content: { level: 'info', msg: 'info msg' } },
                { operation_id: ctx.operationId, content: { level: 'warn', msg: 'warn msg' } },
                { operation_id: ctx.operationId, content: { level: 'error', msg: 'error msg' } }
            ]);
        });
    });
});
