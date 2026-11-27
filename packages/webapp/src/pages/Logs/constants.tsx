import type { FilterOption } from '../../components/patterns/FilterMultiSelect';
import type { SearchOperationsState, SearchOperationsType } from '@nangohq/types';

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
            { label: 'Token refresh webhook', value: 'webhook:connection_refresh' },
            { label: 'Connection deletion webhook', value: 'webhook:connection_delete' }
        ]
    },
    { value: 'tool', label: 'Tool', children: [{ label: 'Tool called', value: 'tool:call' }] },
    { value: 'events', label: 'Event-based execution' },
    { value: 'proxy', label: 'Proxy' },
    { value: 'deploy', label: 'Deploy' },
    {
        value: 'function',
        label: 'Function',
        children: [{ label: 'Function invoked', value: 'function:invoke' }]
    },
    {
        value: 'agent_session',
        label: 'Agent session',
        children: [
            { label: 'Agent session created', value: 'agent_session:create' },
            { label: 'Agent session terminated', value: 'agent_session:terminate' },
            { label: 'Agent session tool search', value: 'agent_session:tool_search' }
        ]
    }
];
export const typesList: SearchOperationsType[] = [
    'action',
    'action:run',
    ...typesOptions.flatMap((opt) => [opt.value, ...(opt.children?.map((child) => child.value) ?? [])])
];
