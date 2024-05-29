import type { ColumnDef } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Input } from '../../../components/ui/input/Input';
import { useSearchMessages } from '../../../hooks/useLogs';
import type { SearchOperationsData } from '@nangohq/types';
import { formatDateToLogFormat, formatQuantity } from '../../../utils/utils';
import { useStore } from '../../../store';
import * as Table from '../../../components/ui/Table';
import Spinner from '../../../components/ui/Spinner';
import Info from '../../../components/ui/Info';
import { LevelTag } from './LevelTag';
import { MessageRow } from './MessageRow';
import { ChevronRightIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { useMemo, useState } from 'react';
import { useDebounce, useInterval } from 'react-use';
import { Tag } from '../../../components/ui/label/Tag';
import { Skeleton } from '../../../components/ui/Skeleton';

export const columns: ColumnDef<SearchOperationsData>[] = [
    {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        size: 170,
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

export const SearchInOperation: React.FC<{ operationId: string; live: boolean }> = ({ operationId, live }) => {
    const env = useStore((state) => state.env);

    const [search, setSearch] = useState<string | undefined>();
    const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>();
    const { data, error, loading, trigger } = useSearchMessages(env, { limit: 20, operationId, search: debouncedSearch });

    const table = useReactTable({
        data: data ? data.data : [],
        columns,
        getCoreRowModel: getCoreRowModel()
    });
    useDebounce(() => setDebouncedSearch(search), 250, [search]);

    const total = useMemo(() => {
        if (!data?.pagination) {
            return 0;
        }
        return formatQuantity(data.pagination.total);
    }, [data?.pagination]);

    useInterval(
        () => {
            // Auto refresh
            trigger();
        },
        live ? 5000 : null
    );

    if (!data && loading) {
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
        <div>
            <div className="flex justify-between items-center">
                <h4 className="font-semibold text-sm flex items-center gap-2">Logs {loading && <Spinner size={1} />}</h4>
                <div className="text-white text-xs">{total} logs found</div>
            </div>
            <header className="mt-4">
                <Input
                    before={<MagnifyingGlassIcon className="w-4" />}
                    placeholder="Search logs..."
                    className="border-border-gray-400"
                    onChange={(e) => setSearch(e.target.value)}
                />
            </header>
            <main>
                {error && (
                    <Info color="red" classNames="text-xs" padding="p-2" size={20}>
                        An error occurred
                    </Info>
                )}
                <Table.Table className="my-6 table-fixed">
                    <Table.Header>
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
                    <Table.Body>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => <MessageRow key={row.id} row={row} />)
                        ) : (
                            <Table.Row>
                                <Table.Cell colSpan={columns.length} className="h-24 text-center">
                                    No results.
                                </Table.Cell>
                            </Table.Row>
                        )}
                    </Table.Body>
                </Table.Table>
            </main>
        </div>
    );
};
