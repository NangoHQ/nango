import { describe, beforeAll, it, expect } from 'vitest';
import { getOperationContext } from './client.js';
import { migrateMapping } from './es/helpers.js';
import { getOperation, listMessages, listOperations } from './models/messages.js';
import type { MessageRow, OperationRowInsert } from './types/messages.js';

const operationPayload: OperationRowInsert = {
    accountId: 1234,
    accountName: 'test',
    environmentId: 5678,
    environmentName: 'dev',
    type: 'sync',
    message: ''
};

describe('client', () => {
    beforeAll(async () => {
        await migrateMapping();
    });

    it('should insert an operation', async () => {
        const ctx = await getOperationContext(operationPayload);
        expect(ctx).toMatchObject({ operationId: expect.toBeUUID() });

        const list = await listOperations({ limit: 1 });
        expect(list).toStrictEqual<MessageRow[]>([
            {
                accountId: 1234,
                accountName: 'test',
                code: null,
                configId: null,
                configName: null,
                connectionId: null,
                connectionName: null,
                createdAt: expect.toBeIsoDate(),
                endedAt: null,
                environmentId: 5678,
                environmentName: 'dev',
                error: null,
                id: ctx.id,
                jobId: null,
                level: 'info',
                message: '',
                meta: null,
                parentId: null,
                request: null,
                response: null,
                source: 'nango',
                startedAt: null,
                state: 'waiting',
                syncId: null,
                syncName: null,
                title: null,
                type: 'sync',
                updatedAt: expect.toBeIsoDate(),
                userId: null
            }
        ]);
    });

    describe('general state', () => {
        it('should set operation as started', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.start();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
                level: 'info',
                state: 'running',
                started_at: expect.toBeIsoDate(),
                ended_at: null
            });
        });

        it('should set operation as cancelled', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.cancel();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
                level: 'info',
                state: 'cancelled',
                started_at: expect.toBeIsoDate(),
                ended_at: null
            });
        });

        it('should set operation as timeout', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.timeout();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
                level: 'info',
                state: 'timeout',
                started_at: expect.toBeIsoDate(),
                ended_at: null
            });
        });

        it('should set operation as finished', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.finish();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
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

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
                level: 'info',
                state: 'failed',
                started_at: expect.toBeIsoDate(),
                ended_at: null
            });
        });

        it('should set operation as failed and finished', async () => {
            const ctx = await getOperationContext(operationPayload);
            await ctx.failed();
            await ctx.finish();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
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

            const list = await listMessages({ parentId: ctx.id, limit: 5 });
            expect(list).toMatchObject([
                { parentId: ctx.id, content: { level: 'trace', msg: 'trace msg' } },
                { parentId: ctx.id, content: { level: 'debug', msg: 'debug msg' } },
                { parentId: ctx.id, content: { level: 'info', msg: 'info msg' } },
                { parentId: ctx.id, content: { level: 'warn', msg: 'warn msg' } },
                { parentId: ctx.id, content: { level: 'error', msg: 'error msg' } }
            ]);
        });
    });
});
