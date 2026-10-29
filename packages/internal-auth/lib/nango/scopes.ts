import type { ScriptType } from '@nangohq/types';

/** Every scope a runner task can be minted with. Sync-only scopes are omitted for other script types. */
export const TASK_CAPABILITY_SCOPES = [
    'persist:log',
    'persist:records',
    'persist:cursor',
    'persist:checkpoint',
    'persist:locks',
    'persist:telemetry',
    'persist:abort',
    'persist:sync-conflict',
    'jobs:putTask',
    'jobs:heartbeat',
    'api:connection:read',
    'api:integration:read',
    'api:metadata:write',
    'api:env-vars:read',
    'api:sync:trigger',
    'api:action:trigger'
] as const;

export type TaskCapabilityScope = (typeof TASK_CAPABILITY_SCOPES)[number];

const SYNC_ONLY_SCOPES: ReadonlySet<TaskCapabilityScope> = new Set(['persist:records', 'persist:cursor', 'persist:sync-conflict']);

export function taskScopesForScriptType(scriptType: ScriptType): readonly TaskCapabilityScope[] {
    switch (scriptType) {
        case 'sync':
        case 'webhook':
            return [...TASK_CAPABILITY_SCOPES];
        case 'action':
        case 'on-event':
        case 'function':
            return TASK_CAPABILITY_SCOPES.filter((scope) => !SYNC_ONLY_SCOPES.has(scope));
    }
}
