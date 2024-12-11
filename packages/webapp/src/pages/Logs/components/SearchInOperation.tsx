import type { ColumnDef } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Input } from '../../../components/ui/input/Input';
import { useSearchMessages } from '../../../hooks/useLogs';
import type { SearchMessages, SearchMessagesData } from '@nangohq/types';
import { formatDateToLogFormat, formatQuantity } from '../../../utils/utils';
import { useStore } from '../../../store';
import * as Table from '../../../components/ui/Table';
import Spinner from '../../../components/ui/Spinner';
import { Info } from '../../../components/Info';
import { LevelTag } from './LevelTag';
import { MessageRow } from './MessageRow';
import { ChevronRightIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce, useIntersection, useInterval } from 'react-use';
import { Tag } from '../../../components/ui/label/Tag';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Button } from '../../../components/ui/button/Button';

export const columns: ColumnDef<SearchMessagesData>[] = [
    {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        size: 180,
        cell: ({ row }) => {
            return <div className="font-code text-s">{formatDateToLogFormat(row.original.createdAt)}</div>;
        }
    },
    {
        accessorKey: 'type',
        header: 'Type',
        size: 80,
        cell: ({ row }) => {
            return <Tag>{row.original.type === 'log' ? 'Message' : 'HTTP'}</Tag>;
        }
    },
    {
        accessorKey: 'level',
        header: 'Level',
        size: 70,
        cell: ({ row }) => {
            return <LevelTag level={row.original.level} />;
        }
    },
    {
        accessorKey: 'message',
        header: 'Additional Info',
        size: 'auto' as unknown as number,
        cell: ({ row }) => {
            return <div className="truncate">{row.original.message}</div>;
        }
    },
    {
        accessorKey: 'id',
        header: '',
        size: 40,
        cell: () => {
            return (
                <div className="-ml-2">
                    <ChevronRightIcon />
                </div>
            );
        }
    }
];

const limit = 50;

export const SearchInOperation: React.FC<{ operationId: string; isLive: boolean }> = ({ operationId, isLive }) => {
    const env = useStore((state) => state.env);

    // --- Data fetch
    const [search, setSearch] = useState<string | undefined>();
    const cursorBefore = useRef<SearchMessages['Body']['cursorBefore']>();
    const cursorAfter = useRef<SearchMessages['Body']['cursorAfter']>();
    const [hasLoadedMore, setHasLoadedMore] = useState<boolean>(false);
    const [readyToDisplay, setReadyToDisplay] = useState<boolean>(false);
    const { data, error, loading, trigger, manualFetch } = useSearchMessages(env, { limit, operationId, search });
    const [messages, setMessages] = useState<SearchMessagesData[]>([]);

    useDebounce(
        () => {
            setMessages([]);
            trigger({});
        },
        250,
        [search]
    );
    useEffect(() => {
        // Data aggregation to enable infinite scroll
        // Because states are changing we need to deduplicate and update rows
        setMessages((prev) => {
            if (prev.length <= 0 || !data?.data) {
                return data?.data || [];
            }

            const next = data.data;
            for (const item of prev) {
                if (next.find((n) => n.id === item.id)) {
                    continue;
                }
                next.push(item);
            }

            return next;
        });
        if (data?.pagination.cursorBefore) {
            cursorBefore.current = data?.pagination.cursorBefore;
        }
        if (data?.data) {
            setReadyToDisplay(true);
        }
    }, [data?.data]);
    useEffect(() => {
        if (data?.pagination.cursorAfter && !hasLoadedMore) {
            // We set the cursor only on first page (if we haven't hit a next page)
            // Otherwise the live refresh will erase
            cursorAfter.current = data.pagination.cursorAfter;
        }
    }, [hasLoadedMore, data]);
    useDebounce(
        () => {
            // We clear the cursor because it's a brand new search
            cursorAfter.current = null;
            // Debounce the trigger to avoid spamming the backend and avoid conflict with rapid filter change
            trigger({});
        },
        200,
        []
    );

    // --- Table Display
    const table = useReactTable({
        data: messages,
        columns,
        getCoreRowModel: getCoreRowModel()
    });
    const totalHumanReadable = useMemo(() => {
        if (!data?.pagination) {
            return 0;
        }
        return formatQuantity(data.pagination.total);
    }, [data?.pagination]);

    // --- Live // auto refresh
    useInterval(
        function onAutoRefresh() {
            trigger({ cursorBefore: cursorBefore.current });
        },
        isLive && !loading ? 5000 : null
    );

    // --- Infinite scroll
    // We use the cursor manually because we want to keep refreshing the head even we add stuff to the tail
    const bottomScrollRef = useRef(null);
    const bottomScroll = useIntersection(bottomScrollRef, {
        root: null,
        rootMargin: '0px',
        threshold: 1
    });
    const appendItems = async () => {
        if (!cursorAfter.current) {
            return;
        }
        const rows = await manualFetch({ cursorAfter: cursorAfter.current });
        if (!rows || 'error' in rows) {
            return;
        }

        cursorAfter.current = rows.res.pagination.cursorAfter;
        setHasLoadedMore(true);
        setMessages((prev) => [...prev, ...rows.res.data]);
    };
    useEffect(() => {
        // when the load more button is fully in view
        if (!bottomScroll || !bottomScroll.isIntersecting) {
            return;
        }
        if (cursorAfter.current && !loading) {
            void appendItems();
        }
    }, [bottomScroll, loading, bottomScrollRef]);

    const loadMore = () => {
        if (!loading) {
            void appendItems();
        }
    };

    if (!readyToDisplay) {
        return (
            <div>
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-sm flex items-center gap-2">Logs</h4>
                </div>
                <Skeleton className="mt-2 w-[250px]" />
            </div>
        );
    }

    return (
        <div className="flex-grow-0 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center">
                <h4 className="font-semibold text-sm flex items-center gap-2">Logs {loading && <Spinner size={1} />}</h4>
                <div className="text-white text-xs">
                    {totalHumanReadable} {data?.pagination && data.pagination.total > 1 ? 'logs' : 'log'} found
                </div>
            </div>
            <header className="mt-4">
                <Input
                    before={<MagnifyingGlassIcon className="w-4" />}
                    placeholder="Search logs..."
                    className="border-border-gray-400"
                    onChange={(e) => setSearch(e.target.value)}
                />
            </header>
            <main className="flex flex-col overflow-hidden">
                {error && <Info variant={'destructive'}>An error occurred</Info>}
                <Table.Table className="mt-6 table-fixed flex flex-col overflow-hidden">
                    <Table.Header className="w-full table table-fixed">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <Table.Row key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <Table.Head
                                            key={header.id}
                                            style={{
                                                width: header.getSize()
                                            }}
                                            className="bg-pure-black"
                                        >
                                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                        </Table.Head>
                                    );
                                })}
                            </Table.Row>
                        ))}
                    </Table.Header>
                    <Table.Body className="overflow-y-scroll block w-full">
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => <MessageRow key={row.original.id} row={row} />)
                        ) : messages.length <= 0 && !loading && readyToDisplay ? (
                            <Table.Row>
                                <Table.Cell colSpan={columns.length} className="h-24 text-center">
                                    No results.
                                </Table.Cell>
                            </Table.Row>
                        ) : (
                            <Table.Row>
                                {table.getAllColumns().map((col, i) => {
                                    return (
                                        <Table.Cell key={i}>
                                            <Skeleton style={{ width: col.getSize() }} />
                                        </Table.Cell>
                                    );
                                })}
                            </Table.Row>
                        )}

                        {data && data.pagination.total > 0 && data.data.length > 0 && data.pagination && cursorAfter.current && readyToDisplay && (
                            <div ref={bottomScrollRef}>
                                <Button disabled={loading} variant="active" className="w-full justify-center" onClick={() => loadMore()}>
                                    {loading ? (
                                        <>
                                            <Spinner size={1} /> Loading...
                                        </>
                                    ) : (
                                        'Load More'
                                    )}
                                </Button>
                            </div>
                        )}
                    </Table.Body>
                </Table.Table>
            </main>
        </div>
    );
};
