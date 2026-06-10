import { ChevronRight } from 'lucide-react';

import { OperationTag } from './components/OperationTag';
import { ProviderTag } from './components/ProviderTag';
import { StatusTag } from './components/StatusTag';
import { formatDateToLogFormat, getRunTime } from '../../utils/utils';

import type { FilterOption } from '../../components/patterns/FilterMultiSelect';
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
        accessorKey: 'duration',
        header: 'Duration',
        size: 100,
        cell: ({ row }) => {
            if (!row.original.endedAt || !row.original.startedAt) {
                return 'n/a';
            }

            const duration = getRunTime(new Date(row.original.startedAt).toISOString(), new Date(row.original.endedAt).toISOString());
            const displayDuration = duration.split(' ')[0];
            return <div className="font-code text-s">{displayDuration}</div>;
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
                    <ChevronRight size={16} />
                </div>
            );
        }
    }
];

export const defaultLimit = 25;
export const refreshInterval = 2_500;

export const statusOptions: FilterOption<SearchOperationsState>[] = [
    { label: 'All', value: 'all' },
    { label: 'Success', value: 'success' },
    { label: 'Failed', value: 'failed' },
    { label: 'Running', value: 'running' },
    { label: 'Cancelled', value: 'cancelled' },
    { label: 'Timeout', value: 'timeout' },
    { label: 'Waiting', value: 'waiting' }
];

export const typesOptions: FilterOption<SearchOperationsType>[] = [
    { value: 'all', label: 'All' },
    {
        value: 'auth',
        label: 'Auth',
        children: [
            { label: 'Connection created', value: 'auth:create_connection' },
            { label: 'Token refreshed', value: 'auth:refresh_token' }
        ]
    },
    {
        value: 'sync',
        label: 'Sync',
        children: [
            { label: 'Sync initialized', value: 'sync:init' },
            { label: 'Sync executed', value: 'sync:run' },
            { label: 'Incremental execution triggered', value: 'sync:request_run' },
            { label: 'Full execution triggered', value: 'sync:request_run_full' },
            { label: 'Sync execution cancelled', value: 'sync:cancel' },
            { label: 'Sync schedule paused', value: 'sync:pause' },
            { label: 'Sync schedule resumed', value: 'sync:unpause' },
            { label: 'Sync variant created', value: 'sync:create_variant' },
            { label: 'Sync variant deleted', value: 'sync:delete_variant' }
        ]
    },
    {
        value: 'webhook',
        label: 'Webhook',
        children: [
            { label: 'External webhook executed', value: 'webhook:incoming' },
            { label: 'External webhook forwarded', value: 'webhook:forward' },
            { label: 'Connection creation webhook', value: 'webhook:connection_create' },
            { label: 'Sync completion webhook', value: 'webhook:sync' },
            { label: 'Token refresh webhook', value: 'webhook:connection_refresh' }
        ]
    },
    { value: 'action', label: 'Action' },
    { value: 'events', label: 'Event-based execution' },
    { value: 'proxy', label: 'Proxy' },
    { value: 'deploy', label: 'Deploy' }
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
    'events:validate_connection': null,
    'proxy:call': null,
    'sync:cancel': null,
    'sync:create_variant': null,
    'sync:delete_variant': null,
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
