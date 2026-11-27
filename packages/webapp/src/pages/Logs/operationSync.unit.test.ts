import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { operationsListKey, syncOperationIntoLists } from './operationSync.js';

import type { OperationRow } from '@nangohq/types';

function op(id: string, state: OperationRow['state'], endedAt: string | null = null): OperationRow {
    return { id, state, startedAt: '2026-11-27T12:00:00Z', endedAt } as OperationRow;
}

describe('syncOperationIntoLists', () => {
    it('updates the matching row in every cached list and leaves the others alone', () => {
        const client = new QueryClient();
        const page = { data: [op('a', 'running'), op('b', 'running')], pagination: { total: 2, cursor: null } };
        client.setQueryData([...operationsListKey('dev'), ['all'], 'filters-1'], { pages: [page], pageParams: [null] });
        client.setQueryData([...operationsListKey('dev'), ['success', 'running'], 'filters-2'], { pages: [page], pageParams: [null] });

        syncOperationIntoLists(client, 'dev', op('a', 'success', '2026-11-27T12:00:05Z'));

        for (const key of [
            [['all'], 'filters-1'],
            [['success', 'running'], 'filters-2']
        ]) {
            const data = client.getQueryData<{ pages: { data: OperationRow[] }[] }>([...operationsListKey('dev'), ...key]);
            expect(data?.pages[0]?.data.map((row) => row.state)).toEqual(['success', 'running']);
            expect(data?.pages[0]?.data[0]?.endedAt).toBe('2026-11-27T12:00:05Z');
        }
    });

    it('refetches a list whose status filter no longer matches, instead of relabelling the row', () => {
        const client = new QueryClient();
        const key = [...operationsListKey('dev'), ['running'], 'filters'];
        client.setQueryData(key, { pages: [{ data: [op('a', 'running')], pagination: { total: 1, cursor: null } }], pageParams: [null] });

        syncOperationIntoLists(client, 'dev', op('a', 'success', '2026-11-27T12:00:05Z'));

        const data = client.getQueryData<{ pages: { data: OperationRow[] }[] }>(key);
        expect(data?.pages[0]?.data[0]?.state).toBe('running');
        expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    });
});
