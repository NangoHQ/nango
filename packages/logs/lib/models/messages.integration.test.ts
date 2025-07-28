import { afterEach } from 'node:test';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from './logContextGetter.js';
import { listMessages } from './messages.js';
import { deleteIndex, migrateMapping } from '../es/helpers.js';
import { indexMessages } from '../es/schema.js';

import type { ListMessages } from './messages.js';
import type { OperationRowInsert } from '@nangohq/types';

const account = { id: 1234, name: 'test' };
const environment = { id: 5678, name: 'dev' };
const operationPayload: OperationRowInsert = { operation: { type: 'sync', action: 'run' } };

describe('messages', () => {
    beforeAll(async () => {
        await deleteIndex({ prefix: indexMessages.index });
        await migrateMapping();
    });
    afterEach(() => {
        vi.clearAllMocks();
    });

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
        expect(list4.cursorBefore).toBeDefined();
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
