import { describe, beforeAll, it, expect } from 'vitest';
import { getOperationContext } from './client.js';
import { deleteIndex, migrateMapping } from './es/helpers.js';
import type { ListOperations } from './models/messages.js';
import { getOperation, listMessages, listOperations } from './models/messages.js';
import type { OperationRowInsert } from './types/messages.js';

const account = { id: 1234, name: 'test' };
const environment = { id: 5678, name: 'dev' };
const operationPayload: OperationRowInsert = {
    operation: {
        type: 'sync',
        action: 'run'
    },
    message: ''
};

describe('client', () => {
    beforeAll(async () => {
        await deleteIndex();
        await migrateMapping();
    });

    it('should insert an operation', async () => {
        const ctx = await getOperationContext(operationPayload, { start: false, account, environment });
        expect(ctx).toMatchObject({ id: expect.any(String) });

        const list = await listOperations({ limit: 1 });
        expect(list).toStrictEqual<ListOperations>({
            count: 1,
            items: [
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
                    source: 'internal',
                    startedAt: null,
                    state: 'waiting',
                    syncId: null,
                    syncName: null,
                    title: null,
                    type: 'log',
                    updatedAt: expect.toBeIsoDate(),
                    userId: null,
                    operation: { action: 'run', type: 'sync' }
                }
            ]
        });
    });

    describe('states', () => {
        it('should set operation as started', async () => {
            const ctx = await getOperationContext(operationPayload, { account, environment });
            await ctx.start();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
                level: 'info',
                state: 'running',
                startedAt: expect.toBeIsoDate(),
                endedAt: null
            });
        });

        it('should set operation as cancelled', async () => {
            const ctx = await getOperationContext(operationPayload, { account, environment });
            await ctx.cancel();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
                level: 'info',
                state: 'cancelled',
                startedAt: expect.toBeIsoDate(),
                endedAt: expect.toBeIsoDate()
            });
        });

        it('should set operation as timeout', async () => {
            const ctx = await getOperationContext(operationPayload, { account, environment });
            await ctx.timeout();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
                level: 'info',
                state: 'timeout',
                startedAt: expect.toBeIsoDate(),
                endedAt: expect.toBeIsoDate()
            });
        });

        it('should set operation as success', async () => {
            const ctx = await getOperationContext(operationPayload, { account, environment });
            await ctx.success();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
                level: 'info',
                state: 'success',
                startedAt: expect.toBeIsoDate(),
                endedAt: expect.toBeIsoDate()
            });
        });

        it('should set operation as failed', async () => {
            const ctx = await getOperationContext(operationPayload, { account, environment });
            await ctx.failed();

            const operation = await getOperation({ id: ctx.id });

            expect(operation).toMatchObject({
                id: ctx.id,
                level: 'info',
                state: 'failed',
                startedAt: expect.toBeIsoDate(),
                endedAt: expect.toBeIsoDate()
            });
        });
    });

    describe('log type', () => {
        it('should log all types', async () => {
            const ctx = await getOperationContext(operationPayload, { account, environment });
            await ctx.trace('trace msg');
            await ctx.debug('debug msg');
            await ctx.info('info msg');
            await ctx.warn('warn msg');
            await ctx.error('error msg');

            const list = await listMessages({ parentId: ctx.id, limit: 5 });
            expect(list).toMatchObject({
                count: 5,
                items: [
                    { parentId: ctx.id, level: 'error', message: 'error msg' },
                    { parentId: ctx.id, level: 'warn', message: 'warn msg' },
                    { parentId: ctx.id, level: 'info', message: 'info msg' },
                    { parentId: ctx.id, level: 'debug', message: 'debug msg' },
                    { parentId: ctx.id, level: 'trace', message: 'trace msg' }
                ]
            });
        });
    });
});
