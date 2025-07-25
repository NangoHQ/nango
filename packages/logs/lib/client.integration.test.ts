import { afterEach } from 'node:test';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { deleteIndex, migrateMapping } from './es/helpers.js';
import { indexMessages } from './es/schema.js';
import { logContextGetter } from './models/logContextGetter.js';
import * as model from './models/messages.js';
import { getOperation, listMessages, listOperations } from './models/messages.js';
import { logger } from './utils.js';

import type { ListOperations } from './models/messages.js';
import type { OperationRowInsert } from '@nangohq/types';

const account = { id: 1234, name: 'test' };
const environment = { id: 5678, name: 'dev' };
const operationPayload: OperationRowInsert = {
    operation: { type: 'sync', action: 'run' }
};

describe('client', () => {
    beforeAll(async () => {
        await deleteIndex({ prefix: indexMessages.index });
        await migrateMapping();
    });
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should list nothing', async () => {
        const list = await listOperations({ accountId: account.id, limit: 1, states: ['all'] });
        expect(list).toStrictEqual<ListOperations>({
            cursor: null,
            count: 0,
            items: []
        });
    });

    it('should insert an operation', async () => {
        const spy = vi.spyOn(model, 'createOperation');
        const ctx = await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false, start: false });
        expect(ctx).toMatchObject({ id: expect.any(String) });
        expect(spy).toHaveBeenCalled();

        const list = await listOperations({ accountId: account.id, limit: 1, states: ['all'] });
        expect(list).toStrictEqual<ListOperations>({
            cursor: null,
            count: 1,
            items: [
                {
                    accountId: 1234,
                    accountName: 'test',
                    createdAt: expect.toBeIsoDate(),
                    endedAt: null,
                    environmentId: 5678,
                    environmentName: 'dev',
                    expiresAt: expect.toBeIsoDate(),
                    id: ctx.id,
                    level: 'info',
                    message: 'Sync executed',
                    source: 'internal',
                    startedAt: null,
                    state: 'waiting',
                    type: 'operation',
                    updatedAt: expect.toBeIsoDate(),
                    operation: { action: 'run', type: 'sync' }
                }
            ]
        });
    });

    it('should respect dryRun=true', async () => {
        const spyMsg = vi.spyOn(model, 'createMessage');
        const spyLogInfo = vi.spyOn(logger, 'info');
        const spyLogError = vi.spyOn(logger, 'error');

        // Create operation
        expect(spyMsg).not.toHaveBeenCalled();
        const ctx = await logContextGetter.create(operationPayload, { account, environment }, { dryRun: true, logToConsole: true });

        expect(ctx).toMatchObject({ id: expect.any(String) });
        expect(spyMsg).not.toHaveBeenCalled();
        expect(spyLogInfo).toHaveBeenCalled();

        // Insert msg
        await ctx.error('test');
        expect(spyMsg).not.toHaveBeenCalled();
        expect(spyLogInfo).toHaveBeenCalledTimes(1);
        expect(spyLogError).toHaveBeenCalledTimes(1);
    });

    it('should respect logToConsole=false', async () => {
        const spy = vi.spyOn(logger, 'info');

        // Create operation
        expect(spy).not.toHaveBeenCalled();
        const ctx = await logContextGetter.create(operationPayload, { account, environment }, { dryRun: true, logToConsole: false });

        expect(ctx).toMatchObject({ id: expect.any(String) });
        expect(spy).not.toHaveBeenCalled();

        // Insert msg
        await ctx.error('test');
        expect(spy).not.toHaveBeenCalled();
    });

    describe('states', () => {
        it('should set operation as started', async () => {
            const ctx = await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false });
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
            const ctx = await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false });
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
            const ctx = await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false });
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
            const ctx = await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false });
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
            const ctx = await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false });
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
            const ctx = await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false });
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
                    { parentId: ctx.id, level: 'debug', message: 'trace msg' }
                ]
            });
        });
    });
});
