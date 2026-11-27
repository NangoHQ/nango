import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce, useInterval, useMount } from 'react-use';

import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nangohq/design-system';

import { Skeleton } from '@/components/ui/Skeleton';
import { usePageVisible } from '@/hooks/usePageVisible';
import { useSearchQueryState } from '@/hooks/useSearchQueryState';
import { operationQueryKey } from '../../../hooks/useLogs';
import { queryClient, useStore } from '../../../store';
import { track } from '../../../utils/analytics';
import { APIError, apiFetch } from '../../../utils/api';
import { expandLogsTypes, slidePeriod } from '../../../utils/logs';
import { computeLogsGridTemplate } from '../column-sizing';
import { defaultLimit, refreshInterval } from '../constants';
import { useLogsFilters } from '../filters';
import { ConnectionCell, DurationCell, FunctionCell, IntegrationCell, StatusCell, TimestampCell, TypeCell } from '../operationCells';
import { operationsListKey } from '../operationSync';

import type { GetOperation, SearchOperations, SearchOperationsData } from '@nangohq/types';

interface Props {
    onSelectOperation: (open: boolean, operationId: string) => void;
    selectedOperationId?: string | null;
    tabStopOperationId?: string | null;
    onLoadedIdsChange?: (ids: string[]) => void;
    onTotalChange?: (total: number) => void;
    panelOpen: boolean;
}

interface CellContext {
    now: Date;
    panelOpen: boolean;
}

const columns: {
    id: string;
    header: string;
    hiddenWithPanel?: boolean;
    align?: 'start' | 'end';
    cell: (operation: SearchOperationsData, context: CellContext) => React.ReactNode;
}[] = [
    { id: 'createdAt', header: 'Timestamp', cell: (operation, { now }) => <TimestampCell createdAt={operation.createdAt} now={now} /> },
    { id: 'duration', header: 'Duration', cell: (operation) => <DurationCell operation={operation} /> },
    { id: 'state', header: 'Status', cell: (operation) => <StatusCell operation={operation} /> },
    { id: 'type', header: 'Type', cell: (operation) => <TypeCell operation={operation} /> },
    { id: 'integration', header: 'Integration', hiddenWithPanel: true, cell: (operation) => <IntegrationCell operation={operation} /> },
    { id: 'function', header: 'Function', cell: (operation, { panelOpen }) => <FunctionCell operation={operation} withLogo={panelOpen} /> },
    { id: 'connection', header: 'Connection', hiddenWithPanel: true, cell: (operation) => <ConnectionCell operation={operation} /> }
];

const ROW_HEIGHT_PX = 36;

export const SearchAllOperations: React.FC<Props> = ({
    onSelectOperation,
    selectedOperationId,
    tabStopOperationId,
    onLoadedIdsChange,
    onTotalChange,
    panelOpen
}) => {
    const env = useStore((state) => state.env);

    const tableContainerRef = useRef<HTMLDivElement>(null);

    // --- Data fetch
    const [search] = useSearchQueryState();
    const { isLive, states, types, integrations, connections, syncs, agentSessions, period } = useLogsFilters();

    // We optimize the refresh and memory when the users is waiting for new operations (= scroll is on top)
    const [isScrollTop, setIsScrollTop] = useState(false);
    const [manualLoadMore, setManualLoadMore] = useState(true);

    const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>(() => search);
    useDebounce(
        () => {
            if (search && search !== debouncedSearch) {
                track('logs:filter_update', { filter: 'search' });
            }
            setDebouncedSearch(search);
            setManualLoadMore(search !== ''); // Because it can spam the backend we disable infinite scroll
        },
        250,
        [search]
    );

    /**
     * Because we haven't build a forward pagination it's currently impossible to have a proper infinite scroll both way and a live refresh
     * - If we scroll down, new pages will load but live refresh will constantly refresh those pages which is most of the time useless
     * - If we limit the number of pages, the first page will be discarded and we'll "loose" the head with no way to going up since we don't have forward pagination
     *
     * So we trick the system with a best-effort strategy
     * - The query below use interval refresh except when you start scrolling
     * - When you scroll to the bottom, we disable interval refresh, and the infiniteQuery load the next pages
     * - When you scroll back to the top we trim all the pages so they don't get refresh, and we re-enable the interval refresh
     */
    const queryKey = useMemo(
        () => [...operationsListKey(env), states, types, integrations, connections, syncs, agentSessions, period, debouncedSearch],
        [env, states, types, integrations, connections, syncs, agentSessions, period, debouncedSearch]
    );
    const { data, isLoading, isFetching, isFetchingNextPage, isPlaceholderData, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery<
        SearchOperations['Success'],
        SearchOperations['Errors'],
        { pages: SearchOperations['Success'][] },
        unknown[],
        string | null
    >({
        queryKey,
        queryFn: async ({ pageParam, signal }) => {
            let periodCopy: SearchOperations['Body']['period'];
            // Slide the window automatically when live
            // We do it only at query time so the URL stays the same
            if (isLive) {
                const tmp = slidePeriod({ from: period[0], to: period[1] });
                periodCopy = { from: tmp.from.toISOString(), to: tmp.to!.toISOString() };
            } else {
                periodCopy = { from: new Date(period[0]).toISOString(), to: new Date(period[1]).toISOString() };
            }

            const res = await apiFetch(`/api/v1/logs/operations?env=${env}`, {
                method: 'POST',
                body: JSON.stringify({
                    states,
                    types: expandLogsTypes(types),
                    integrations,
                    connections,
                    syncs,
                    agentSessions,
                    period: periodCopy,
                    // Search is post-filtering the list of operations, it can change the actual number of returned operations
                    // It's more efficient to increase the limit of pre-filtered operations we get, and do less round trip
                    // The "drawbacks" is that if every operations are matching, it can be slower and return more rows that expected
                    limit: debouncedSearch ? defaultLimit * 10 : defaultLimit,
                    cursor: pageParam,
                    search: debouncedSearch
                } satisfies SearchOperations['Body']),
                signal
            });
            if (res.status !== 200) {
                throw new APIError({ res, json: (await res.json()) as Record<string, unknown> });
            }

            return (await res.json()) as SearchOperations['Success'];
        },
        refetchInterval: false,
        initialPageParam: null,
        staleTime: isLive ? refreshInterval : 30_000,
        gcTime: isLive ? refreshInterval : 30_000,

        getNextPageParam: (lastGroup) => lastGroup.pagination.cursor,
        placeholderData: keepPreviousData,

        refetchOnWindowFocus: false,
        refetchOnMount: false
    });

    const polling = isLive && isScrollTop && !debouncedSearch;
    const pageVisible = usePageVisible(() => {
        if (polling) {
            void refetch({ cancelRefetch: true });
        }
    });
    useInterval(
        async () => {
            await refetch({ cancelRefetch: true });
        },
        polling && pageVisible ? refreshInterval : null
    );
    useMount(async () => {
        // We can't use standard refetchOnMount because it will refresh every pages so we force refresh the first one
        if (isLive) {
            await refetch({ cancelRefetch: true });
        }
    });

    const trim = useCallback(() => {
        queryClient.setQueryData(queryKey, (oldData: any) => {
            if (!oldData || !oldData.pages || oldData.pages.length <= 1) {
                return oldData;
            }

            return {
                ...oldData,
                pages: [oldData.pages[0]],
                pageParams: [oldData.pageParams[0]]
            };
        });
    }, [queryKey]);

    const flatData = useMemo<SearchOperationsData[]>(() => {
        return data?.pages?.flatMap((page) => page.data) ?? [];
    }, [data]);

    useEffect(() => {
        onLoadedIdsChange?.(flatData.map((op) => op.id));
    }, [flatData, onLoadedIdsChange]);

    const totalOperations = data?.pages?.[0]?.pagination.total ?? 0;
    useEffect(() => {
        onTotalChange?.(totalOperations);
    }, [totalOperations, onTotalChange]);

    const flashIds = useArrivedIds(flatData, JSON.stringify(queryKey), !data || isPlaceholderData);

    // The panel polls on its own interval. When the list sees the open operation change first, refresh the panel now.
    const selectedState = selectedOperationId ? flatData.find((op) => op.id === selectedOperationId)?.state : undefined;
    useEffect(() => {
        if (!selectedOperationId || !selectedState) {
            return;
        }
        const key = operationQueryKey(env, selectedOperationId);
        const panel = queryClient.getQueryData<GetOperation['Success']>(key);
        if (panel && panel.data.state !== selectedState) {
            void queryClient.invalidateQueries({ queryKey: key });
        }
    }, [env, selectedOperationId, selectedState]);

    const now = new Date();
    const gridTemplate = computeLogsGridTemplate(flatData, { panelOpen, now });
    const visibleColumns = panelOpen ? columns.filter((column) => !column.hiddenWithPanel) : columns;

    // --- Infinite scroll
    const totalFetched = flatData.length;
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (!containerRefElement) {
                return;
            }

            const { scrollHeight, scrollTop, clientHeight } = containerRefElement;

            // We don't want to refresh or trim the pages when searching
            if (manualLoadMore) {
                return;
            }

            // once the user has scrolled within 200px of the bottom of the table, fetch more data if we can
            if (scrollHeight - scrollTop - clientHeight < 200 && !isFetching && totalFetched < totalOperations) {
                void fetchNextPage({ cancelRefetch: true });
            }
            if (scrollTop === 0 && isLive && !isScrollTop) {
                setIsScrollTop(true);
                trim();
                void refetch();
            } else if (scrollTop !== 0 && isScrollTop) {
                setIsScrollTop(false);
            }
        },
        [fetchNextPage, isFetching, totalFetched, totalOperations, isLive, isScrollTop, manualLoadMore]
    );
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);
    const onClickLoadMore = useCallback(() => {
        setManualLoadMore(false);
    }, []);
    useEffect(() => {
        // When searching, pagination is incomplete it can be daunting to manually click the button a lot
        // So we disable manual load more until we find a next page
        if (!debouncedSearch || manualLoadMore) {
            return;
        }

        if (!hasNextPage) {
            setManualLoadMore(true);
        }

        if (data?.pages && data.pages.length > 0 && data.pages.at(-1)!.data.length > 0) {
            setManualLoadMore(true);
        }
    }, [data, hasNextPage]);

    return (
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" ref={tableContainerRef} onScroll={(e) => fetchMoreOnBottomReached(e.currentTarget)}>
            <Table columns={gridTemplate}>
                <TableHeader>
                    <TableRow>
                        {visibleColumns.map((column) => (
                            <TableHead key={column.id} align={column.align}>
                                {column.header}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>

                {isLoading && (
                    <TableBody>
                        {Array.from({ length: 8 }, (_, i) => (
                            <TableRow key={i}>
                                {visibleColumns.map((column) => (
                                    <TableCell key={column.id}>
                                        <Skeleton className="w-3/4" />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                )}

                {flatData.length > 0 && (
                    <OperationsBody
                        operations={flatData}
                        columns={visibleColumns}
                        context={{ now, panelOpen }}
                        flashIds={flashIds}
                        tableContainerRef={tableContainerRef}
                        onSelectOperation={onSelectOperation}
                        selectedOperationId={selectedOperationId}
                        tabStopOperationId={tabStopOperationId}
                    />
                )}
            </Table>

            {flatData.length > 0 && hasNextPage && (
                <div className="flex justify-center p-4">
                    <Button onClick={onClickLoadMore} variant={'outline'} loading={isFetchingNextPage}>
                        Load more...
                    </Button>
                </div>
            )}
            {flatData.length > 0 && !hasNextPage && <div className="px-5 py-4 type-text-regular-xs text-text-secondary">Nothing more to load...</div>}

            {!isLoading && flatData.length <= 0 && (
                <div className="flex flex-col items-center gap-2 p-10 py-20 text-center">
                    <div className="type-text-regular-sm text-text-strong">No logs found</div>
                    <div className="type-text-regular-sm text-text-muted">Note that logs older than 15 days are automatically cleared.</div>
                </div>
            )}
        </div>
    );
};

function useArrivedIds(operations: SearchOperationsData[], resetKey: string, pending: boolean): Set<string> {
    const seen = useRef<{ key: string; ids: Set<string> } | null>(null);
    const arrived = useMemo(() => {
        const previous = seen.current?.key === resetKey ? seen.current.ids : null;
        const ids = new Set<string>();
        if (!previous || pending) {
            return ids;
        }
        // Stop at the first known row: rows below it are an older page loading, not new arrivals.
        for (const operation of operations) {
            if (previous.has(operation.id)) {
                break;
            }
            ids.add(operation.id);
        }
        return ids;
    }, [operations, resetKey, pending]);

    useEffect(() => {
        if (pending) {
            return;
        }
        const previous = seen.current?.key === resetKey ? seen.current.ids : [];
        seen.current = { key: resetKey, ids: new Set([...previous, ...operations.map((operation) => operation.id)]) };
    }, [operations, resetKey, pending]);

    return arrived;
}

const OperationsBody: React.FC<{
    operations: SearchOperationsData[];
    columns: typeof columns;
    context: CellContext;
    flashIds: Set<string>;
    tableContainerRef: React.RefObject<HTMLDivElement | null>;
    onSelectOperation: Props['onSelectOperation'];
    selectedOperationId: Props['selectedOperationId'];
    tabStopOperationId: Props['tabStopOperationId'];
}> = ({ operations, columns, context, flashIds, tableContainerRef, onSelectOperation, selectedOperationId, tabStopOperationId }) => {
    // Important: Keep the row virtualizer in the lowest component possible to avoid unnecessary re-renders.
    const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
        count: operations.length,
        estimateSize: () => ROW_HEIGHT_PX,
        getScrollElement: () => tableContainerRef.current,
        getItemKey: (index) => operations[index]?.id ?? index,
        // Measure dynamic row height, except in firefox because it measures table border height incorrectly
        measureElement:
            typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1 ? (element) => element?.getBoundingClientRect().height : undefined,
        overscan: 5
    });

    useEffect(() => {
        const container = tableContainerRef.current;
        const index = selectedOperationId ? operations.findIndex((operation) => operation.id === selectedOperationId) : -1;
        const item = rowVirtualizer.measurementsCache[index];
        if (!container || !item) {
            return;
        }
        // Row offsets start below the sticky header, which the virtualizer's own scrollToIndex doesn't account for.
        const headerHeight = container.querySelector('thead')?.offsetHeight ?? 0;
        if (item.start < container.scrollTop) {
            container.scrollTop = item.start;
        } else if (headerHeight + item.end > container.scrollTop + container.clientHeight) {
            container.scrollTop = headerHeight + item.end - container.clientHeight;
        }
        // Only follow a change of selection, not every new page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedOperationId]);

    const lastSelectedId = useRef(selectedOperationId);
    useEffect(() => {
        const closedId = lastSelectedId.current;
        lastSelectedId.current = selectedOperationId;
        if (closedId && !selectedOperationId) {
            tableContainerRef.current?.querySelector<HTMLElement>(`[data-operation-id="${CSS.escape(closedId)}"]`)?.focus({ preventScroll: true });
        }
    }, [selectedOperationId, tableContainerRef]);

    const virtualItems = rowVirtualizer.getVirtualItems();
    // The tab stop must be a rendered row, or Tab skips the table while that row is scrolled out of the window.
    const renderedIds = virtualItems.map((item) => operations[item.index]?.id);
    const firstVisible = virtualItems.find((item) => item.start >= (rowVirtualizer.scrollOffset ?? 0)) ?? virtualItems[0];
    const tabStopId = tabStopOperationId && renderedIds.includes(tabStopOperationId) ? tabStopOperationId : firstVisible && operations[firstVisible.index]?.id;

    return (
        <TableBody height={rowVirtualizer.getTotalSize()}>
            {virtualItems.map((virtualRow) => {
                const operation = operations[virtualRow.index];
                if (!operation) {
                    return null;
                }
                return (
                    <TableRow
                        key={operation.id}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        data-operation-id={operation.id}
                        tabIndex={operation.id === tabStopId ? 0 : -1}
                        offset={virtualRow.start}
                        interactive
                        selected={operation.id === selectedOperationId}
                        flash={flashIds.has(operation.id)}
                        onClick={() => onSelectOperation(operation.id !== selectedOperationId, operation.id)}
                    >
                        {columns.map((column) => (
                            <TableCell key={column.id} align={column.align}>
                                {column.cell(operation, context)}
                            </TableCell>
                        ))}
                    </TableRow>
                );
            })}
        </TableBody>
    );
};
