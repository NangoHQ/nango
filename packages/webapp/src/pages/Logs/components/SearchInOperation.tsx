import type { ColumnDef } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Input } from '../../../components/ui/input/Input';
import { useSearchMessages } from '../../../hooks/useLogs';
import type { SearchOperationsData } from '@nangohq/types';
import { formatDateToInternationalFormat } from '../../../utils/utils';
import { useStore } from '../../../store';
import * as Table from '../../../components/ui/Table';
import Spinner from '../../../components/ui/Spinner';
import Info from '../../../components/ui/Info';
import { MessageTag } from './MessageTag';
import { LevelTag } from './LevelTag';
import { MessageRow } from './MessageRow';
import { MagnifyingGlassIcon } from '@radix-ui/react-icons';

export const columns: ColumnDef<SearchOperationsData>[] = [
    {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        size: 120,
        cell: ({ row }) => {
            return formatDateToInternationalFormat(row.original.createdAt);
        }
    },
    {
        accessorKey: 'type',
        header: 'Type',
        size: 80,
        cell: ({ row }) => {
            return <MessageTag type={row.original.type} />;
        }
    },
    {
        accessorKey: 'level',
        header: 'Level',
        size: 60,
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
    }
];

export const SearchInOperation: React.FC<{ operationId: string }> = ({ operationId }) => {
    const env = useStore((state) => state.env);

    const { data, error, loading } = useSearchMessages(env, { limit: 20, operationId });

    const table = useReactTable({
        data: data ? data.data : [],
        columns,

        getCoreRowModel: getCoreRowModel()
    });

    return (
        <div>
            <h4 className="font-semibold text-sm flex items-center gap-2">Logs {loading && <Spinner size={1} />}</h4>
            <header className="mt-4">
                <Input before={<MagnifyingGlassIcon className="w-4" />} placeholder="Search logs..." className="border-border-gray-400" />
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
