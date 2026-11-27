import type { OperationRow, SearchOperations } from '@nangohq/types';
import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

type OperationsPages = InfiniteData<SearchOperations['Success']>;

export function operationsListKey(env: string) {
    return [env, 'logs:operations:infinite'];
}

// The list's key holds its status filter right after the prefix.
function statusFilter(key: QueryKey): unknown {
    return key[operationsListKey('').length];
}

function withStatus(data: OperationsPages, operation: OperationRow): OperationsPages | null {
    let changed = false;
    const pages = data.pages.map((page) => {
        const index = page.data.findIndex((row) => row.id === operation.id);
        const row = page.data[index];
        if (!row || (row.state === operation.state && row.endedAt === operation.endedAt)) {
            return page;
        }
        changed = true;
        const rows = [...page.data];
        rows[index] = { ...row, state: operation.state, startedAt: operation.startedAt, endedAt: operation.endedAt };
        return { ...page, data: rows };
    });
    return changed ? { ...data, pages } : null;
}

export function syncOperationIntoLists(queryClient: QueryClient, env: string, operation: OperationRow) {
    for (const [key, data] of queryClient.getQueriesData<OperationsPages>({ queryKey: operationsListKey(env) })) {
        if (!data) {
            continue;
        }
        const updated = withStatus(data, operation);
        if (!updated) {
            continue;
        }
        const states = statusFilter(key);
        if (Array.isArray(states) && states.length > 0 && !states.includes(operation.state)) {
            void queryClient.invalidateQueries({ queryKey: key, exact: true });
            continue;
        }
        queryClient.setQueryData(key, updated);
    }
}
