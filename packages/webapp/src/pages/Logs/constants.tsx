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
        size: 140,
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
        value: 'auth',
        name: 'Auth',
        childs: [
            { name: 'Connection created', value: 'auth:create_connection' },
            { name: 'Token refreshed', value: 'auth:refresh_token' }
        ]
    },
    {
        value: 'sync',
        name: 'Sync',
        childs: [
            { name: 'Sync initialized', value: 'sync:init' },
            { name: 'Sync executed', value: 'sync:run' },
            { name: 'Incremental execution triggered', value: 'sync:request_run' },
            { name: 'Full execution triggered', value: 'sync:request_run_full' },
            { name: 'Sync execution cancelled', value: 'sync:cancel' },
            { name: 'Sync schedule paused', value: 'sync:pause' },
            { name: 'Sync schedule resumed', value: 'sync:unpause' }
        ]
    },
    {
        value: 'webhook',
        name: 'Webhook',
        childs: [
            { name: 'External webhook executed', value: 'webhook:incoming' },
            { name: 'External webhook forwarded', value: 'webhook:forward' },
            { name: 'Connection creation webhook', value: 'webhook:connection_create' },
            { name: 'Sync completion webhook', value: 'webhook:sync' },
            { name: 'Token refresh webhook', value: 'webhook:connection_refresh' }
        ]
    },
    { value: 'action', name: 'Action' },
    { value: 'events', name: 'Event-based execution' },
    { value: 'proxy', name: 'Proxy' },
    { value: 'deploy', name: 'Deploy' }
];

export const integrationsDefaultOptions: SearchOperationsIntegration[] = ['all'];
export const connectionsDefaultOptions: SearchOperationsConnection[] = ['all'];
export const syncsDefaultOptions: SearchOperationsSync[] = ['all'];
