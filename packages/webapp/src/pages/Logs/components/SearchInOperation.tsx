import type { ColumnDef } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Input } from '../../../components/ui/input/Input';
import { useSearchOperations } from '../../../hooks/useLogs';
import type { SearchOperationsData } from '@nangohq/types';
import { formatDateToInternationalFormat } from '../../../utils/utils';
import { StatusTag } from './StatusTag';
import { useStore } from '../../../store';
import * as Table from '../../../components/ui/Table';
import Spinner from '../../../components/ui/Spinner';
import { OperationRow } from './OperationRow';
import Info from '../../../components/ui/Info';

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
        accessorKey: 'state',
        header: 'Status',
        size: 100,
        cell: ({ row }) => {
            return <StatusTag state={row.original.state} />;
        }
    },
    {
        accessorKey: 'operation',
        header: 'Type',
        size: 100,
        cell: ({ row }) => {
            return row.original.type;
        }
    },
    {
        accessorKey: 'message',
        header: 'Additional Info',
        cell: ({ row }) => {
            return <div className="truncate">{row.original.message}</div>;
        }
    }
];

export const SearchInOperation: React.FC<{ operationId: string }> = ({ operationId }) => {
    const env = useStore((state) => state.env);

    const { data, error, loading } = useSearchOperations(env, { limit: 20, operationId });

    const table = useReactTable({
        data: data ? data.data : [],
        columns,
        getCoreRowModel: getCoreRowModel()
    });

    return (
        <div>
            <h4 className="font-semibold text-sm">Logs {loading && <Spinner size={1} />}</h4>
            <header>
                <Input placeholder="Search logs" />
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
                            table.getRowModel().rows.map((row) => <OperationRow key={row.id} row={row} />)
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
