import { describe, beforeAll, it, expect, vi } from 'vitest';
import { deleteIndex, migrateMapping } from '../es/helpers.js';
import type { ListOperations } from './messages.js';
import { getOperation, listOperations } from './messages.js';
import { afterEach } from 'node:test';
import { logContextGetter } from './logContextGetter.js';
import type { OperationRowInsert } from '@nangohq/types';
import { timeoutOperations } from '../helpers/timeoutOperations.js';
import { setTimeout } from 'node:timers/promises';
import { getFormattedMessage } from './helpers.js';

const account = { id: 1234, name: 'test' };
const environment = { id: 5678, name: 'dev' };
const operationPayload: OperationRowInsert = { operation: { type: 'sync', action: 'run' }, message: '' };

describe('model', () => {
    beforeAll(async () => {
        await deleteIndex();
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
            await logContextGetter.create(operationPayload, { start: false, account, environment }, { logToConsole: false });
            await logContextGetter.create(operationPayload, { start: false, account, environment }, { logToConsole: false });

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
                getFormattedMessage({ ...operationPayload, expiresAt: new Date(Date.now() - 86400 * 1000).toISOString() }),
                { account, environment },
                { logToConsole: false }
            );
            const ctx2 = await logContextGetter.create(
                getFormattedMessage({ ...operationPayload, expiresAt: new Date(Date.now() + 86400 * 1000).toISOString() }),
                { account, environment },
                { logToConsole: false }
            );

            await timeoutOperations();
            await setTimeout(500);

            const op1 = await getOperation({ id: ctx1.id });
            expect(op1.state).toBe('timeout');

            const op2 = await getOperation({ id: ctx2.id });
            expect(op2.state).toBe('running');
        });
    });
});
