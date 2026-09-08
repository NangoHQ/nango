import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { deleteIndex, migrateMapping } from '../es/helpers.js';
import { indexOperations } from '../es/schema.js';
import { getFormattedOperation } from './helpers.js';
import { logContextGetter } from './logContextGetter.js';
import { createOperation, getOperation, listFilters, listOperations, setTimeoutForAll } from './operations.js';

import type { ListOperations } from './operations.js';
import type { OperationRowInsert } from '@nangohq/types';

const account = { id: 1234, name: 'test' };
const environment = { id: 5678, name: 'dev' };
const operationPayload: OperationRowInsert = { operation: { type: 'sync', action: 'run' } };

describe('operations', () => {
    beforeAll(async () => {
        await deleteIndex({ prefix: indexOperations.index });
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

    it('should filter by agent session and list the sessions it can filter on', async () => {
        const sessionId = nanoid();
        const otherSessionId = nanoid();
        const inSession = getFormattedOperation({ ...operationPayload, actor: { kind: 'session', id: sessionId } }, { account, environment });
        await createOperation(inSession);
        // A second session, so filtering by one has to exclude the other rather than every session actor
        await createOperation(getFormattedOperation({ ...operationPayload, actor: { kind: 'session', id: otherSessionId } }, { account, environment }));
        await createOperation(getFormattedOperation({ ...operationPayload, actor: { kind: 'user', id: 1 } }, { account, environment }));

        const list = await listOperations({ accountId: account.id, environmentId: environment.id, limit: 10, agentSessions: [sessionId] });
        expect(list.items.map((item) => item.id)).toStrictEqual([inSession.id]);

        const filters = await listFilters({ accountId: account.id, environmentId: environment.id, limit: 10, category: 'agentSession' });
        expect(filters.items.map((item) => item.key).sort()).toStrictEqual([sessionId, otherSessionId].sort());
    });

    it('should ignore an empty agent session filter rather than excluding everything', async () => {
        await createOperation(getFormattedOperation({ ...operationPayload, actor: { kind: 'session', id: nanoid() } }, { account, environment }));

        const list = await listOperations({ accountId: account.id, environmentId: environment.id, limit: 10, agentSessions: [] });
        expect(list.items.length).toBeGreaterThan(0);
    });
});
