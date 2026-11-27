import type { SearchOperationsState, SearchOperationsType } from '@nangohq/types';

export const defaultLimit = 25;
export const refreshInterval = 2_500;

export type LogsState = Exclude<SearchOperationsState, 'all'>;
export type LogsType = Exclude<SearchOperationsType, 'all'>;

export interface TypeOption {
    value: LogsType;
    label: string;
    children?: { value: LogsType; label: string }[];
}

export const statusOptions: { value: LogsState; label: string }[] = [
    { value: 'success', label: 'Success' },
    { value: 'failed', label: 'Failed' },
    { value: 'running', label: 'Running' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'timeout', label: 'Timeout' },
    { value: 'waiting', label: 'Waiting' }
];
export const statusValues = statusOptions.map((option) => option.value);

export const typesOptions: TypeOption[] = [
    {
        value: 'auth',
        label: 'Auth',
        children: [
            { value: 'auth:create_connection', label: 'create connection' },
            { value: 'auth:refresh_token', label: 'refresh token' }
        ]
    },
    {
        value: 'sync',
        label: 'Sync',
        children: [
            { value: 'sync:run', label: 'run' },
            { value: 'sync:init', label: 'init' },
            { value: 'sync:pause', label: 'pause' },
            { value: 'sync:unpause', label: 'unpause' },
            { value: 'sync:request_run', label: 'request run' },
            { value: 'sync:request_run_full', label: 'request run full' },
            { value: 'sync:cancel', label: 'cancel' },
            { value: 'sync:create_variant', label: 'create variant' },
            { value: 'sync:delete_variant', label: 'delete variant' }
        ]
    },
    { value: 'tool', label: 'Tool' },
    {
        value: 'webhook',
        label: 'Webhook',
        children: [
            { value: 'webhook:incoming', label: 'incoming' },
            { value: 'webhook:forward', label: 'forward' },
            { value: 'webhook:sync', label: 'sync' },
            { value: 'webhook:connection_create', label: 'connection create' },
            { value: 'webhook:connection_refresh', label: 'connection refresh' },
            { value: 'webhook:connection_delete', label: 'connection delete' }
        ]
    },
    { value: 'proxy', label: 'Proxy' },
    { value: 'events', label: 'Event-based execution' },
    { value: 'function', label: 'Function' },
    {
        value: 'agent_session',
        label: 'Agent session',
        children: [
            { value: 'agent_session:create', label: 'create' },
            { value: 'agent_session:terminate', label: 'terminate' },
            { value: 'agent_session:tool_search', label: 'tool search' }
        ]
    },
    { value: 'deploy', label: 'Deploy' }
];

export const typesList: LogsType[] = [
    'action',
    'action:run',
    'tool:call',
    'function:invoke',
    ...typesOptions.flatMap((opt) => [opt.value, ...(opt.children?.map((child) => child.value) ?? [])])
];
