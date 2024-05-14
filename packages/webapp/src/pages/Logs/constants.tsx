import type { ColumnDef } from '@tanstack/react-table';
import type { SearchLogsData, SearchLogsState } from '@nangohq/types';
import { formatDateToInternationalFormat } from '../../utils/utils';
import { StatusTag } from './components/StatusTag';
import { OperationTag } from './components/OperationTag';
import type { MultiSelectArgs } from './components/MultiSelect';
import { ChevronRight } from '@geist-ui/icons';

export const columns: ColumnDef<SearchLogsData>[] = [
    {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        size: 150,
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
        size: 200,
        cell: ({ row }) => {
            return <OperationTag operation={row.original.operation!} />;
        }
    },
    {
        accessorKey: 'configId',
        header: 'Integration',
        size: 200,
        cell: ({ row }) => {
            return row.original.configName;
        }
    },
    {
        accessorKey: 'syncId',
        header: 'Script',
        size: 200,
        cell: ({ row }) => {
            return row.original.syncName;
        }
    },
    {
        accessorKey: 'connectionId',
        header: 'Connection',
        size: 200,
        cell: ({ row }) => {
            return row.original.connectionName;
        }
    },
    {
        accessorKey: 'id',
        header: '',
        size: 10,
        cell: () => {
            return (
                <div>
                    <ChevronRight size={15} />
                </div>
            );
        }
    }
];

export const statusDefaultOptions: SearchLogsState[] = ['all'];
export const statusOptions: MultiSelectArgs['options'] = [
    {
        name: 'All',
        value: 'all'
    },
    {
        name: 'Success',
        value: 'success'
    },
    {
        name: 'Failed',
        value: 'failed'
    },
    {
        name: 'Running',
        value: 'running'
    },
    {
        name: 'Cancelled',
        value: 'cancelled'
    },
    {
        name: 'Timeout',
        value: 'timeout'
    },
    {
        name: 'Waiting',
        value: 'waiting'
    }
];
