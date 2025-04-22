import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { parseAsArrayOf, parseAsBoolean, parseAsString, parseAsStringEnum, parseAsStringLiteral, parseAsTimestamp, useQueryState } from 'nuqs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInterval, useMount, useWindowSize } from 'react-use';

import { DatePicker } from './DatePicker';
import { SearchableMultiSelect } from './SearchableMultiSelect';
import { TypesSelect } from './TypesSelect';
import { MultiSelect } from '../../../components/MultiSelect';
import { Skeleton } from '../../../components/ui/Skeleton';
import Spinner from '../../../components/ui/Spinner';
import * as Table from '../../../components/ui/Table';
import { queryClient, useStore } from '../../../store';
import { columns, defaultLimit, refreshInterval, statusOptions, typesList } from '../constants';
import { OperationRow } from './OperationRow';
import { apiFetch } from '../../../utils/api';
import { getPresetRange, slidePeriod } from '../../../utils/logs';
import { calculateTableSizing } from '../../../utils/table';
import { formatQuantity } from '../../../utils/utils';

import type { OperationRow as OperationRowType, SearchOperations, SearchOperationsData } from '@nangohq/types';
import type { Table as ReactTable } from '@tanstack/react-table';
import type { DateRange } from 'react-day-picker';

interface Props {
    onSelectOperation: (open: boolean, operationId: string) => void;
}

const parseLive = parseAsBoolean.withDefault(true).withOptions({ history: 'push' });
const parseStates = parseAsArrayOf(parseAsStringLiteral(statusOptions.map((opt) => opt.value)), ',')
    .withDefault(['all'])
    .withOptions({ history: 'push' });
const parseTypes = parseAsArrayOf(parseAsStringEnum(typesList), ',').withDefault(['all']).withOptions({ history: 'push' });
const parseIntegrations = parseAsArrayOf(parseAsString, ',').withDefault(['all']).withOptions({ history: 'push' });
const parseConnections = parseAsArrayOf(parseAsString, ',').withDefault(['all']).withOptions({ history: 'push' });
const parseSyncs = parseAsArrayOf(parseAsString, ',').withDefault(['all']).withOptions({ history: 'push' });
const parsePeriod = parseAsArrayOf(parseAsTimestamp, ',')
    .withOptions({ history: 'push' })
    .withDefault(Object.values(getPresetRange('last24h')) as Date[]);

export const SearchAllOperations: React.FC<Props> = ({ onSelectOperation }) => {
    const env = useStore((state) => state.env);

    // The virtualizer will need a reference to the scrollable container element
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const windowSize = useWindowSize();

    // --- Data fetch
    const [isLive, setLive] = useQueryState('live', parseLive);
    const [states, setStates] = useQueryState('states', parseStates);
    const [types, setTypes] = useQueryState('types', parseTypes);
    const [integrations, setIntegrations] = useQueryState('integrations', parseIntegrations);
    const [connections, setConnections] = useQueryState('connections', parseConnections);
    const [syncs, setSyncs] = useQueryState('syncs', parseSyncs);
    const [period, setPeriod] = useQueryState('period', parsePeriod);

    // We optimize the refresh and memory when the users is waiting for new operations (= scroll is on top)
    const [isScrollTop, setIsScrollTop] = useState(false);

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
    const { data, isLoading, isFetching, fetchNextPage, refetch } = useInfiniteQuery<
        SearchOperations['Success'],
        SearchOperations['Errors'],
        { pages: SearchOperations['Success'][] },
        unknown[],
        string | null
    >({
        queryKey: [env, 'logs:operations:infinite', states, types, integrations, connections, syncs, period],
        queryFn: async ({ pageParam, signal }) => {
            let periodCopy: SearchOperations['Body']['period'];
            // Slide the window automatically when live
            // We do it only at query time so the URL stays the same
            if (isLive) {
                const tmp = slidePeriod({ from: period[0], to: period[1] });
                periodCopy = { from: tmp.from!.toISOString(), to: tmp.to!.toISOString() };
            } else {
                periodCopy = { from: new Date(period[0]).toISOString(), to: new Date(period[1]).toISOString() };
            }

            const res = await apiFetch(`/api/v1/logs/operations?env=${env}`, {
                method: 'POST',
                body: JSON.stringify({
                    states,
                    types,
                    integrations,
                    connections,
                    syncs,
                    period: periodCopy,
                    limit: defaultLimit,
                    cursor: pageParam
                } satisfies SearchOperations['Body']),
                signal
            });
            if (res.status !== 200) {
                throw new Error();
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

    useInterval(
        async () => {
            await refetch({ cancelRefetch: true });
        },
        isLive && isScrollTop ? refreshInterval : null
    );
    useMount(async () => {
        // We can't use standard refetchOnMount because it will refresh every pages so we force refresh the first one
        if (isLive) {
            await refetch({ cancelRefetch: true });
        }
    });

    const trim = useCallback(() => {
        queryClient.setQueryData([env, 'logs:operations:infinite', states, types, integrations, connections, syncs, period], (oldData: any) => {
            if (!oldData || !oldData.pages || oldData.pages.length <= 1) {
                return oldData;
            }

            return {
                ...oldData,
                pages: [oldData.pages[0]],
                pageParams: [oldData.pageParams[0]]
            };
        });
    }, [env, states, types, integrations, connections, syncs, period]);

    const flatData = useMemo<OperationRowType[]>(() => {
        return data?.pages?.flatMap((page) => page.data) ?? [];
    }, [data]);

    const [totalHumanReadable, totalOperations] = useMemo(() => {
        if (!data?.pages?.[0]?.pagination.total) {
            return ['0', 0];
        }
        return [formatQuantity(data?.pages?.[0]?.pagination.total || 0), data?.pages?.[0]?.pagination.total || 0];
    }, [data]);

    // --- Table Display
    const table = useReactTable({
        data: flatData,
        columns,
        getCoreRowModel: getCoreRowModel()
    });

    // auto compute headers width
    const headers = table.getFlatHeaders();
    useLayoutEffect(() => {
        if (tableContainerRef.current) {
            const initialColumnSizing = calculateTableSizing(headers, tableContainerRef.current?.clientWidth);
            table.setColumnSizing(initialColumnSizing);
        }
    }, [headers, windowSize.width]);

    // --- Infinite scroll
    const totalFetched = flatData.length;
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (!containerRefElement) {
                return;
            }

            const { scrollHeight, scrollTop, clientHeight } = containerRefElement;
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
        [fetchNextPage, isFetching, totalFetched, totalOperations, isLive, isScrollTop]
    );
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    // --- Period
    const onPeriodChange = (range: DateRange, live: boolean) => {
        void setPeriod(range.from && range.to ? [range.from, range.to] : []);
        void setLive(live);
    };

    return (
        <>
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-semibold text-white mb-2 flex gap-4 items-center">Logs {(isLoading || isFetching) && <Spinner size={1} />}</h2>
                <div className="text-white text-xs">
                    {totalHumanReadable} {totalOperations > 1 ? 'logs' : 'log'} found
                </div>
            </div>
            <div className="flex gap-2 justify-between mb-4">
                <div className="w-full"> </div>
                <div className="flex gap-2">
                    <MultiSelect label="Status" options={statusOptions} selected={states} defaultSelect={['all']} onChange={setStates} all />
                    <TypesSelect selected={types} onChange={setTypes} />
                    <SearchableMultiSelect label="Integration" selected={integrations} category={'integration'} onChange={setIntegrations} max={20} />
                    <SearchableMultiSelect label="Connection" selected={connections} category={'connection'} onChange={setConnections} max={20} />
                    <SearchableMultiSelect label="Script" selected={syncs} category={'syncConfig'} onChange={setSyncs} max={20} />

                    <DatePicker isLive={isLive} period={{ from: period[0], to: period[1] }} onChange={onPeriodChange} />
                </div>
            </div>
            <div
                style={{ height: '100%', overflow: 'auto', position: 'relative' }}
                ref={tableContainerRef}
                onScroll={(e) => fetchMoreOnBottomReached(e.currentTarget)}
            >
                <Table.Table className="grid">
                    <Table.Header className="grid sticky top-0 z-10 bg-grayscale-900 ">
                        {table.getHeaderGroups().map((headerGroup) => {
                            return (
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
                            );
                        })}
                    </Table.Header>

                    {flatData.length > 0 && <TableBody table={table} tableContainerRef={tableContainerRef} onSelectOperation={onSelectOperation} />}

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
                        <Table.Body>
                            <Table.Row className="hover:bg-transparent flex absolute w-full">
                                <Table.Cell colSpan={columns.length} className="h-24 text-center p-0 pt-4 w-full">
                                    <div className="flex gap-2 flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                                        <div className="text-center">No logs found</div>
                                        <div className="text-gray-400">Note that logs older than 15 days are automatically cleared.</div>
                                    </div>
                                </Table.Cell>
                            </Table.Row>
                        </Table.Body>
                    )}
                </Table.Table>
            </div>
        </>
    );
};

const TableBody: React.FC<{
    table: ReactTable<SearchOperationsData>;
    tableContainerRef: React.RefObject<HTMLDivElement>;
    onSelectOperation: Props['onSelectOperation'];
}> = ({ table, tableContainerRef, onSelectOperation }) => {
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
                return (
                    <OperationRow
                        key={row.original.id}
                        row={row}
                        onSelectOperation={onSelectOperation}
                        virtualRow={virtualRow}
                        rowVirtualizer={rowVirtualizer}
                    />
                );
            })}
        </Table.Body>
    );
};
