import { useInfiniteQuery } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDebounce, useInterval, useMount } from 'react-use';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, SegmentedControl, SegmentedControlItem } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { useStore } from '../../../../store';
import { APIError, apiFetch } from '../../../../utils/api';
import { calculateTableSizing } from '../../../../utils/table';
import { formatQuantity } from '../../../../utils/utils';
import { columns, defaultLimit } from '../constants';
import { ShowMessage } from '../Message/Show';
import { LogRow } from './LogRow';

import type { LogLevel, MessageRow, OperationRow, SearchMessages } from '@nangohq/types';
import type { Table as ReactTable } from '@tanstack/react-table';

type LevelFilter = 'all' | LogLevel;
const levelOptions: { value: LevelFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'error', label: 'Error' },
    { value: 'warn', label: 'Warn' },
    { value: 'info', label: 'Info' },
    { value: 'debug', label: 'Debug' }
];

function levelCount(counts: Record<LogLevel, number>, level: LevelFilter): number {
    if (level === 'all') {
        return counts.debug + counts.info + counts.warn + counts.error;
    }
    return counts[level];
}

export const Logs: React.FC<{ operation: OperationRow; operationId: string; isLive: boolean }> = ({ operation, operationId, isLive }) => {
    const env = useStore((state) => state.env);
    const [message, setMessage] = useState<MessageRow>();

    // The virtualizer will need a reference to the scrollable container element
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // --- Data fetch
    const [search, setSearch] = useState<string | undefined>();
    const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>();
    const [level, setLevel] = useState<LevelFilter>('all');

    // We optimize the refresh and memory when the users is waiting for new operations (= scroll is on top)
    const [isScrollTop, setIsScrollTop] = useState(false);

    const { data, isLoading, isFetching, fetchNextPage, fetchPreviousPage } = useInfiniteQuery<
        SearchMessages['Success'],
        SearchMessages['Errors'],
        { pages: SearchMessages['Success'][] },
        unknown[],
        { before: string | null } | { after: string | null } | null
    >({
        queryKey: [env, 'logs:messages:infinite', operationId, debouncedSearch, level],
        queryFn: async ({ pageParam, signal }) => {
            const res = await apiFetch(`/api/v1/logs/messages?env=${env}`, {
                method: 'POST',
                body: JSON.stringify({
                    operationId,
                    limit: defaultLimit,
                    search: debouncedSearch,
                    levels: level === 'all' ? undefined : [level],
                    cursorAfter: pageParam && 'after' in pageParam ? pageParam.after : undefined,
                    cursorBefore: pageParam && 'before' in pageParam ? pageParam.before : undefined
                } satisfies SearchMessages['Body']),
                signal
            });
            if (res.status !== 200) {
                throw new APIError({ res, json: (await res.json()) as Record<string, unknown> });
            }

            return (await res.json()) as SearchMessages['Success'];
        },
        initialPageParam: null,
        staleTime: isLive ? 0 : 10_000,
        gcTime: isLive ? 0 : 10_000,

        getNextPageParam: (lastGroup) => {
            return { after: lastGroup.pagination.cursorAfter };
        },
        getPreviousPageParam: (firstPage) => {
            return { before: firstPage.pagination.cursorBefore };
        },

        // Do not changes those boolean they will refresh every pages ever loaded
        refetchOnWindowFocus: false,
        refetchOnMount: false
    });

    const flatData = useMemo<MessageRow[]>(() => {
        return data?.pages?.flatMap((page) => page.data) ?? [];
    }, [data]);

    // Kept across level switches, so the counts don't blank out while the new level loads
    const [levelCounts, setLevelCounts] = useState<Record<LogLevel, number>>();
    useEffect(() => {
        const latest = data?.pages?.[0]?.levelCounts;
        if (latest) {
            setLevelCounts(latest);
        }
    }, [data]);

    const [totalHumanReadable, totalMessages] = useMemo(() => {
        if (!data?.pages?.[0]?.pagination.total) {
            return ['0', 0];
        }
        return [formatQuantity(data?.pages?.[0]?.pagination.total || 0), data?.pages?.[0]?.pagination.total || 0];
    }, [data]);

    useInterval(
        async () => {
            await fetchPreviousPage({ cancelRefetch: true });
        },
        isLive ? 5000 : null
    );
    useMount(async () => {
        // We can't use standard refetchOnMount because it will refresh every pages so we force refresh the first one
        if (isLive) {
            await fetchPreviousPage({ cancelRefetch: true });
        }
    });

    // --- Table Display
    const table = useReactTable({
        data: flatData,
        columns: columns,
        getCoreRowModel: getCoreRowModel()
    });

    // auto compute headers width
    const headers = table.getFlatHeaders();
    useLayoutEffect(() => {
        if (tableContainerRef.current) {
            const initialColumnSizing = calculateTableSizing(headers, tableContainerRef.current?.clientWidth);
            table.setColumnSizing(initialColumnSizing);
        }
    }, [headers]);

    useDebounce(
        () => {
            setDebouncedSearch(search);
        },
        250,
        [search]
    );

    // --- Infinite scroll
    const totalFetched = flatData.length;
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (!containerRefElement) {
                return;
            }

            const { scrollHeight, scrollTop, clientHeight } = containerRefElement;
            // once the user has scrolled within 200px of the bottom of the table, fetch more data if we can
            if (scrollHeight - scrollTop - clientHeight < 10 && !isFetching && !isLoading && totalFetched < totalMessages) {
                void fetchNextPage({ cancelRefetch: false });
            }
            if (scrollTop === 0 && isLive && !isScrollTop) {
                setIsScrollTop(true);
            } else if (scrollTop !== 0 && isScrollTop) {
                setIsScrollTop(false);
            }
        },
        [fetchNextPage, isLoading, isFetching, totalFetched, totalMessages, isLive, isScrollTop]
    );
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    return (
        <div className="grow-0 overflow-hidden flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <h4 className="font-semibold text-sm flex items-center gap-2">Logs {(isLoading || isFetching) && <Spinner />}</h4>
                <div className="flex gap-2 text-text-strong text-xs">
                    <div>
                        {totalHumanReadable} {totalMessages > 1 ? 'logs' : 'log'} found
                    </div>
                    {operation.operation.type === 'sync' && operation.operation.action === 'run' && (
                        <div>
                            <ConditionalTooltip
                                condition={true}
                                content={
                                    <>
                                        Successfull HTTP logs are sampled to 10% to reduce noise.
                                        <br /> Other logs are not sampled
                                    </>
                                }
                            >
                                (sampling is on)
                            </ConditionalTooltip>
                        </div>
                    )}
                </div>
            </div>
            <header className="flex gap-2 items-center">
                <InputGroup className="grow">
                    <InputGroupAddon>
                        <Search />
                    </InputGroupAddon>
                    <InputGroupInput value={search} placeholder="Search logs..." onChange={(e) => setSearch(e.target.value)} />
                    {search && (
                        <InputGroupAddon align="inline-end">
                            <InputGroupButton
                                label="Clear search"
                                variant={'ghost'}
                                size={'icon-xs'}
                                onClick={() => {
                                    setDebouncedSearch('');
                                    setSearch('');
                                }}
                            >
                                <X />
                            </InputGroupButton>
                        </InputGroupAddon>
                    )}
                </InputGroup>
                <SegmentedControl
                    aria-label="Level"
                    value={level}
                    onValueChange={(value) => setLevel(levelOptions.find((option) => option.value === value)?.value ?? 'all')}
                >
                    {levelOptions.map((option) => (
                        <SegmentedControlItem
                            key={option.value}
                            value={option.value}
                            count={levelCounts ? formatQuantity(levelCount(levelCounts, option.value)) : undefined}
                        >
                            {option.label}
                        </SegmentedControlItem>
                    ))}
                </SegmentedControl>
            </header>
            <div
                style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}
                ref={tableContainerRef}
                onScroll={(e) => fetchMoreOnBottomReached(e.currentTarget)}
            >
                <table className="grid w-full caption-bottom text-s border-separate border-spacing-0 text-text-strong">
                    <thead className="grid sticky top-0 z-10 bg-surface-panel">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id} className="flex w-full">
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <th
                                            key={header.id}
                                            className="flex bg-surface-panel px-4 py-2 pt-1.5 text-s text-left align-middle font-semibold"
                                            style={{
                                                width: header.getSize() ? header.getSize() : 'auto'
                                            }}
                                        >
                                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>

                    {flatData.length > 0 && <TableBody table={table} tableContainerRef={tableContainerRef} onSelectMessage={setMessage} />}

                    {isLoading && (
                        <tbody>
                            <tr>
                                {table.getAllColumns().map((col, i) => {
                                    return (
                                        <td key={i} className="px-3 py-2.5">
                                            <Skeleton style={{ width: col.getSize() ? col.getSize() - 20 : 'auto' }} />
                                        </td>
                                    );
                                })}
                            </tr>
                        </tbody>
                    )}

                    {!isFetching && flatData.length <= 0 && (
                        <tbody className="h-10">
                            <tr className="hover:bg-transparent flex absolute w-full">
                                <td colSpan={columns.length} className="text-center p-0 pt-4 w-full">
                                    <div className="text-text-muted">No results.</div>
                                </td>
                            </tr>
                        </tbody>
                    )}
                </table>
            </div>

            <Sheet open={Boolean(message)} onOpenChange={() => setMessage(undefined)}>
                <SheetContent
                    side="right"
                    hideCloseButton
                    className="w-[834px] max-w-none sm:max-w-none p-0 bg-surface-page text-text-strong border-l-border-muted"
                >
                    <SheetTitle className="sr-only">Message Details</SheetTitle>
                    <div className="relative h-full select-text">
                        <div className="absolute top-[26px] left-4">
                            <SheetClose
                                title="Close"
                                className="w-10 h-10 flex items-center justify-center text-text-muted hover:text-text-strong focus:text-text-strong"
                            >
                                <ArrowLeft strokeWidth={1} size={24} />
                            </SheetClose>
                        </div>
                        {message && <ShowMessage message={message} />}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
};

const TableBody: React.FC<{
    table: ReactTable<MessageRow>;
    tableContainerRef: React.RefObject<HTMLDivElement>;
    onSelectMessage: (msg: MessageRow) => void;
}> = ({ table, tableContainerRef, onSelectMessage }) => {
    const { rows } = table.getRowModel();

    // Important: Keep the row virtualizer in the lowest component possible to avoid unnecessary re-renders.
    const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
        count: rows.length,
        estimateSize: () => 41,
        getScrollElement: () => tableContainerRef.current,
        // Measure dynamic row height, except in firefox because it measures table border height incorrectly
        measureElement:
            typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1 ? (element) => element?.getBoundingClientRect().height : undefined,
        overscan: 5
    });

    return (
        <tbody className="grid relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                return <LogRow key={row.original.id} row={row} virtualRow={virtualRow} rowVirtualizer={rowVirtualizer} onSelectMessage={onSelectMessage} />;
            })}
        </tbody>
    );
};
