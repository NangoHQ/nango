import { IconArrowLeft, IconX, IconZoom } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDebounce, useInterval, useMount } from 'react-use';

import { LogRow } from './LogRow';
import { Drawer, DrawerClose, DrawerContent } from '../../../../components/ui/Drawer';
import { Skeleton } from '../../../../components/ui/Skeleton';
import Spinner from '../../../../components/ui/Spinner';
import * as Table from '../../../../components/ui/Table';
import { Button } from '../../../../components/ui/button/Button';
import { Input } from '../../../../components/ui/input/Input';
import { useStore } from '../../../../store';
import { apiFetch } from '../../../../utils/api';
import { calculateTableSizing } from '../../../../utils/table';
import { formatQuantity } from '../../../../utils/utils';
import { ShowMessage } from '../Message/Show';
import { columns, defaultLimit } from '../constants';

import type { MessageRow, SearchMessages } from '@nangohq/types';
import type { Table as ReactTable } from '@tanstack/react-table';

const drawerWidth = '834px';

export const Logs: React.FC<{ operationId: string; isLive: boolean }> = ({ operationId, isLive }) => {
    const env = useStore((state) => state.env);
    const [message, setMessage] = useState<MessageRow>();

    // The virtualizer will need a reference to the scrollable container element
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // --- Data fetch
    const [search, setSearch] = useState<string | undefined>();
    const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>();

    // We optimize the refresh and memory when the users is waiting for new operations (= scroll is on top)
    const [isScrollTop, setIsScrollTop] = useState(false);

    const { data, isLoading, isFetching, fetchNextPage, fetchPreviousPage } = useInfiniteQuery<
        SearchMessages['Success'],
        SearchMessages['Errors'],
        { pages: SearchMessages['Success'][] },
        unknown[],
        { before: string | null } | { after: string | null } | null
    >({
        queryKey: [env, 'logs:messages:infinite', operationId, debouncedSearch],
        queryFn: async ({ pageParam, signal }) => {
            const res = await apiFetch(`/api/v1/logs/messages?env=${env}`, {
                method: 'POST',
                body: JSON.stringify({
                    operationId,
                    limit: defaultLimit,
                    search: debouncedSearch,
                    cursorAfter: pageParam && 'after' in pageParam ? pageParam.after : undefined,

                    // Some cache bug issue I haven't solved yet
                    // Lib is sometimes storing an old pageParam, when we re-open the Drawer it's incorrect in the past
                    // So we discard any cursor that are too old unless we search
                    cursorBefore:
                        pageParam &&
                        'before' in pageParam &&
                        pageParam.before &&
                        (JSON.parse(atob(pageParam.before))[0] > Date.now() - 30_000 || debouncedSearch)
                            ? pageParam.before
                            : undefined
                } satisfies SearchMessages['Body']),
                signal
            });
            if (res.status !== 200) {
                throw new Error();
            }

            return (await res.json()) as SearchMessages['Success'];
        },
        initialPageParam: null,
        staleTime: 30_000,
        placeholderData: keepPreviousData,

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

    const [totalHumanReadable, totalMessages] = useMemo(() => {
        if (!data?.pages?.[0]?.pagination.total) {
            return ['0', 0];
        }
        return [formatQuantity(data?.pages?.[0]?.pagination.total || 0), data?.pages?.[0]?.pagination.total || 0];
    }, [data]);

    useInterval(
        async () => {
            await fetchPreviousPage();
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
        <div className="flex-grow-0 overflow-hidden flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <h4 className="font-semibold text-sm flex items-center gap-2">Logs {(isLoading || isFetching) && <Spinner size={1} />}</h4>
                <div className="text-white text-xs">
                    {totalHumanReadable} {totalMessages > 1 ? 'logs' : 'log'} found
                </div>
            </div>
            <header>
                <Input
                    before={<IconZoom stroke={1} size={18} />}
                    after={
                        search && (
                            <Button
                                variant={'icon'}
                                size={'sm'}
                                onClick={() => {
                                    setDebouncedSearch('');
                                    setSearch('');
                                }}
                            >
                                <IconX stroke={1} size={16} />
                            </Button>
                        )
                    }
                    value={search}
                    placeholder="Search logs..."
                    className="border-border-gray-400"
                    onChange={(e) => setSearch(e.target.value)}
                />
            </header>
            <div
                style={{ height: '100%', overflow: 'auto', position: 'relative' }}
                ref={tableContainerRef}
                onScroll={(e) => fetchMoreOnBottomReached(e.currentTarget)}
            >
                <Table.Table className="grid">
                    <Table.Header className="grid sticky top-0 z-10 bg-grayscale-900 ">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <Table.Row key={headerGroup.id} className="flex w-full">
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <Table.Head
                                            key={header.id}
                                            className="flex"
                                            style={{
                                                width: header.getSize() ? header.getSize() : 'auto'
                                            }}
                                        >
                                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                        </Table.Head>
                                    );
                                })}
                            </Table.Row>
                        ))}
                    </Table.Header>

                    {flatData.length > 0 && <TableBody table={table} tableContainerRef={tableContainerRef} onSelectMessage={setMessage} />}

                    {isLoading && (
                        <Table.Body>
                            <Table.Row>
                                {table.getAllColumns().map((col, i) => {
                                    return (
                                        <Table.Cell key={i}>
                                            <Skeleton style={{ width: col.getSize() ? col.getSize() - 20 : 'auto' }} />
                                        </Table.Cell>
                                    );
                                })}
                            </Table.Row>
                        </Table.Body>
                    )}

                    {!isFetching && flatData.length <= 0 && (
                        <Table.Body className="h-10">
                            <Table.Row className="hover:bg-transparent flex absolute w-full">
                                <Table.Cell colSpan={columns.length} className="text-center p-0 pt-4 w-full">
                                    <div className="text-grayscale-400">No results.</div>
                                </Table.Cell>
                            </Table.Row>
                        </Table.Body>
                    )}
                </Table.Table>
            </div>

            <Drawer
                direction="right"
                snapPoints={[drawerWidth]}
                handleOnly={true}
                noBodyStyles={true}
                nested
                open={Boolean(message)}
                onOpenChange={() => setMessage(undefined)}
            >
                <DrawerContent>
                    <div className={`w-[834px] relative h-screen select-text`}>
                        <div className="absolute top-[26px] left-4">
                            <DrawerClose
                                title="Close"
                                className="w-10 h-10 flex items-center justify-center text-text-light-gray hover:text-white focus:text-white"
                            >
                                <IconArrowLeft stroke={1} size={24} />
                            </DrawerClose>
                        </div>
                        {message && <ShowMessage message={message} />}
                    </div>
                </DrawerContent>
            </Drawer>
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
        <Table.Body className="grid relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                return <LogRow key={row.original.id} row={row} virtualRow={virtualRow} rowVirtualizer={rowVirtualizer} onSelectMessage={onSelectMessage} />;
            })}
        </Table.Body>
    );
};
