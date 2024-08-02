import type { ColumnDef } from '@tanstack/react-table';
import type {
    SearchOperationsConnection,
    SearchOperationsData,
    SearchOperationsIntegration,
    SearchOperationsState,
    SearchOperationsSync,
    SearchOperationsType
} from '@nangohq/types';
import { formatDateToLogFormat } from '../../utils/utils';
import { StatusTag } from './components/StatusTag';
import { OperationTag } from './components/OperationTag';
import type { MultiSelectArgs } from '../../components/MultiSelect';
import { ChevronRightIcon } from '@radix-ui/react-icons';
import { ProviderTag } from './components/ProviderTag';

export const columns: ColumnDef<SearchOperationsData>[] = [
    {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        size: 180,
        cell: ({ row }) => {
            return <div className="font-code text-s">{formatDateToLogFormat(row.original.createdAt)}</div>;
        }
    },
    {
        accessorKey: 'state',
        header: 'Status',
        size: 90,
        cell: ({ row }) => {
            return <StatusTag state={row.original.state} />;
        }
    },
    {
        accessorKey: 'operation',
        header: 'Type',
        size: 100,
        cell: ({ row }) => {
            return <OperationTag message={row.original.message} operation={row.original.operation} />;
        }
    },
    {
        accessorKey: 'integrationId',
        header: 'Integration',
        minSize: 280,
        cell: ({ row }) => {
            return <ProviderTag msg={row.original} />;
        }
    },
    {
        accessorKey: 'syncConfigId',
        header: 'Script',
        minSize: 280,
        cell: ({ row }) => {
            return <div className="truncate font-code text-s">{row.original.syncConfigName || '-'}</div>;
        }
    },
    {
        accessorKey: 'connectionId',
        header: 'Connection',
        minSize: 0,
        size: 0,
        cell: ({ row }) => {
            return <div className="truncate font-code text-s">{row.original.connectionName || '-'}</div>;
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

export const statusDefaultOptions: SearchOperationsState[] = ['all'];
export const statusOptions: MultiSelectArgs<SearchOperationsState>['options'] = [
    { name: 'All', value: 'all' },
    { name: 'Success', value: 'success' },
    { name: 'Failed', value: 'failed' },
    { name: 'Running', value: 'running' },
    { name: 'Cancelled', value: 'cancelled' },
    { name: 'Timeout', value: 'timeout' },
    { name: 'Waiting', value: 'waiting' }
];

export const typesDefaultOptions: SearchOperationsType[] = ['all'];
export const typesOptions = [
    { value: 'all', name: 'All' },
    {
        value: 'sync',
        name: 'Sync',
        childs: [
            { name: 'Execution', value: 'sync:run' },
            { name: 'Pause Schedule', value: 'sync:pause' },
            { name: 'Resume Schedule', value: 'sync:unpause' },
            { name: 'Trigger Incremental Execution', value: 'sync:request_run' },
            { name: 'Trigger Full Execution', value: 'sync:request_run_full' },
            { name: 'Sync Init', value: 'sync:init' },
            { name: 'Cancel Execution', value: 'sync:cancel' }
        ]
    },
    { value: 'action', name: 'Action' },
    { value: 'proxy', name: 'Proxy' },
    { value: 'deploy', name: 'Deploy' },
    { value: 'auth', name: 'Auth' },
    { value: 'webhook', name: 'Webhook' }
];

export const integrationsDefaultOptions: SearchOperationsIntegration[] = ['all'];
export const connectionsDefaultOptions: SearchOperationsConnection[] = ['all'];
export const syncsDefaultOptions: SearchOperationsSync[] = ['all'];
