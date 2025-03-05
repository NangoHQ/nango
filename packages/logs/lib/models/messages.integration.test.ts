import { describe, beforeAll, it, expect, vi } from 'vitest';
import { deleteIndex, migrateMapping } from '../es/helpers.js';
import type { ListOperations, ListMessages } from './messages.js';
import { getOperation, listOperations, listMessages, setTimeoutForAll } from './messages.js';
import { afterEach } from 'node:test';
import { logContextGetter } from './logContextGetter.js';
import type { OperationRowInsert } from '@nangohq/types';
import { getFormattedOperation } from './helpers.js';
import { indexMessages } from '../es/schema.js';

const account = { id: 1234, name: 'test' };
const environment = { id: 5678, name: 'dev' };
const operationPayload: OperationRowInsert = { operation: { type: 'sync', action: 'run' } };

describe('model', () => {
    beforeAll(async () => {
        await deleteIndex({ prefix: indexMessages.index });
        await migrateMapping();
    });
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('operations', () => {
        it('should list nothing', async () => {
            const list = await listOperations({ accountId: account.id, limit: 1, states: ['all'] });
            expect(list).toStrictEqual<ListOperations>({
                cursor: null,
                count: 0,
                items: []
            });
        });

        it('should paginate', async () => {
            await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false, start: false });
            await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false, start: false });

            // First operation = should list one
            const list1 = await listOperations({ accountId: account.id, limit: 1, states: ['all'] });
            expect(list1.count).toBe(2);
            expect(list1.items).toHaveLength(1);
            expect(list1.cursor).toBeDefined();

            // Second operation = should list the second one
            const list2 = await listOperations({ accountId: account.id, limit: 1, states: ['all'], cursor: list1.cursor! });
            expect(list2.count).toBe(2);
            expect(list2.items).toHaveLength(1);
            expect(list2.cursor).toBeDefined();
            expect(list2.items[0]!.id).not.toEqual(list1.items[0]!.id);

            // Empty results
            // When we get the second operation, it's not possible to know if there are more after so we still need to return a cursor
            const list3 = await listOperations({ accountId: account.id, limit: 1, states: ['all'], cursor: list2.cursor! });
            expect(list3.count).toBe(2);
            expect(list3.items).toHaveLength(0);
            expect(list3.cursor).toBeNull();
        });

        it('should timeout old operations', async () => {
            const ctx1 = await logContextGetter.create(
                getFormattedOperation({ ...operationPayload, expiresAt: new Date(Date.now() - 86400 * 1000).toISOString() }),
                { account, environment },
                { logToConsole: false }
            );
            const ctx2 = await logContextGetter.create(
                getFormattedOperation({ ...operationPayload, expiresAt: new Date(Date.now() + 86400 * 1000).toISOString() }),
                { account, environment },
                { logToConsole: false }
            );

            await setTimeoutForAll({ wait: true });

            const op1 = await getOperation({ id: ctx1.id });
            expect(op1.state).toBe('timeout');

            const op2 = await getOperation({ id: ctx2.id });
            expect(op2.state).toBe('running');
        });
    });

    describe('messages', () => {
        it('should list nothing', async () => {
            const list = await listMessages({ limit: 10, parentId: '1' });
            expect(list).toStrictEqual<ListMessages>({
                cursorAfter: null,
                cursorBefore: null,
                count: 0,
                items: []
            });
        });

        it('should paginate', async () => {
            const ctx = await logContextGetter.create(operationPayload, { account, environment }, { logToConsole: false, start: false });
            await ctx.info('1');
            await ctx.info('2');
            await ctx.info('3');
            await ctx.info('4');

            // Should list 2 rows
            const list1 = await listMessages({ limit: 2, parentId: ctx.id });
            expect(list1.count).toBe(4);
            expect(list1.items).toHaveLength(2);
            expect(list1.cursorBefore).toBeDefined();
            expect(list1.cursorAfter).toBeDefined();

            // After:  Should list 2 more rows
            const list2 = await listMessages({ limit: 2, parentId: ctx.id, cursorAfter: list1.cursorAfter });
            expect(list2.count).toBe(4);
            expect(list2.items).toHaveLength(2);
            expect(list2.cursorAfter).toBeDefined();
            expect(list2.items[0]!.id).not.toEqual(list1.items[0]!.id);

            // After: Empty results
            // When we get the second operation, it's not possible to know if there are more after so we still need to return a cursor
            const list3 = await listMessages({ limit: 1, parentId: ctx.id, cursorAfter: list2.cursorAfter });
            expect(list3.count).toBe(4);
            expect(list3.items).toHaveLength(0);
            expect(list2.cursorAfter).toBeDefined();

            // Before: Should list 0 rows before
            const list4 = await listMessages({ limit: 2, parentId: ctx.id, cursorBefore: list1.cursorBefore });
            expect(list4.count).toBe(4);
            expect(list4.items).toHaveLength(0);
            expect(list4.cursorBefore).toBeNull();
            expect(list4.cursorAfter).toBeDefined();

            // Insert a new row
            await ctx.info('4');
            await ctx.info('5');

            // Before: Should list 1 rows before
            const list5 = await listMessages({ limit: 2, parentId: ctx.id, cursorBefore: list1.cursorBefore });
            expect(list5.count).toBe(6);
            expect(list5.items).toHaveLength(2);
            expect(list5.items[0]?.message).toBe('5');
            expect(list5.items[1]?.message).toBe('4');
            expect(list5.cursorBefore).toBeDefined();
            expect(list5.cursorAfter).toBeDefined();
            expect(list5.items[0]!.id).not.toEqual(list1.items[0]!.id);
            expect(list5.cursorBefore).not.toEqual(list1.cursorBefore);
        });
    });
});
