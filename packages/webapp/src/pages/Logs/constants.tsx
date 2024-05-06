import type { ColumnDef } from '@tanstack/react-table';
import type { SearchLogsData } from '@nangohq/types';
import { formatDateToIntFormat } from '../../utils/utils';
import { StatusTag } from './StatusTag';
import { OperationTag } from './OperationTag';
import type { MultiSelectArgs } from './MultiSelect';

export const columns: ColumnDef<SearchLogsData>[] = [
    {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        size: 200,
        cell: ({ row }) => {
            return formatDateToIntFormat(row.original.createdAt);
        }
    },
    {
        accessorKey: 'state',
        header: 'Status',
        size: 140,
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
        accessorKey: 'configId',
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
    }
];

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
