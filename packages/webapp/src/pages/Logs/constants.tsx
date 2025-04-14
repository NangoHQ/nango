import { ChevronRightIcon } from '@radix-ui/react-icons';

import { OperationTag } from './components/OperationTag';
import { ProviderTag } from './components/ProviderTag';
import { StatusTag } from './components/StatusTag';
import { formatDateToLogFormat } from '../../utils/utils';

import type { MultiSelectArgs } from '../../components/MultiSelect';
import type { SearchOperationsData, SearchOperationsState, SearchOperationsType } from '@nangohq/types';
import type { ColumnDef } from '@tanstack/react-table';

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
        minSize: 200,
        cell: ({ row }) => {
            return <ProviderTag msg={row.original} />;
        }
    },
    {
        accessorKey: 'syncConfigId',
        header: 'Script',
        minSize: 150,
        cell: ({ row }) => {
            return <div className="truncate font-code text-s">{row.original.syncConfigName || '-'}</div>;
        }
    },
    {
        accessorKey: 'connectionId',
        header: 'Connection',
        size: 'auto' as unknown as number,
        meta: {
            isGrow: true
        },
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

export const defaultLimit = 50;

export const statusOptions: MultiSelectArgs<SearchOperationsState>['options'] = [
    { name: 'All', value: 'all' },
    { name: 'Success', value: 'success' },
    { name: 'Failed', value: 'failed' },
    { name: 'Running', value: 'running' },
    { name: 'Cancelled', value: 'cancelled' },
    { name: 'Timeout', value: 'timeout' },
    { name: 'Waiting', value: 'waiting' }
];

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
export const typesList = Object.keys({
    'action:run': null,
    'admin:impersonation': null,
    'auth:connection_test': null,
    'auth:create_connection': null,
    'auth:post_connection': null,
    'auth:refresh_token': null,
    'deploy:custom': null,
    'deploy:prebuilt': null,
    'events:post_connection_creation': null,
    'events:pre_connection_deletion': null,
    'proxy:call': null,
    'sync:cancel': null,
    'sync:init': null,
    'sync:pause': null,
    'sync:request_run': null,
    'sync:request_run_full': null,
    'sync:run': null,
    'sync:unpause': null,
    'webhook:connection_create': null,
    'webhook:connection_refresh': null,
    'webhook:forward': null,
    'webhook:incoming': null,
    'webhook:sync': null,
    action: null,
    admin: null,
    all: null,
    auth: null,
    deploy: null,
    events: null,
    proxy: null,
    sync: null,
    webhook: null
} satisfies Record<SearchOperationsType, null>) as SearchOperationsType[];
