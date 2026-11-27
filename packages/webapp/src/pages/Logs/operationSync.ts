import type { OperationRow, SearchOperations } from '@nangohq/types';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

export function operationsListKey(env: string) {
    return [env, 'logs:operations:infinite'];
}

export function syncOperationIntoLists(queryClient: QueryClient, env: string, operation: OperationRow) {
    queryClient.setQueriesData<InfiniteData<SearchOperations['Success']>>({ queryKey: operationsListKey(env) }, (data) => {
        if (!data) {
            return data;
        }
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
        return changed ? { ...data, pages } : data;
    });
}
