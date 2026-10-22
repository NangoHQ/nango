import type { TaskCapabilityResource } from '@nangohq/internal-auth';

/**
 * A jobs task capability token carries `res`. The body must name that environment,
 * connection, and sync. `syncJobId` is not a claim: the sync job row created for
 * this orchestrator task (`run_id`) is the authoritative id.
 */
export function taskPropsBoundToCapability(
    resource: TaskCapabilityResource,
    props: {
        environmentId: number;
        nangoConnectionId: number;
        syncId?: string | undefined;
        syncJobId?: number | undefined;
    },
    taskId: string,
    syncJob: { id: number; sync_id: string; run_id?: string | null | undefined } | null
): boolean {
    if (props.environmentId !== resource.environmentId || props.nangoConnectionId !== resource.connectionId) {
        return false;
    }
    if (resource.syncId) {
        if (props.syncId !== resource.syncId || props.syncJobId === undefined) {
            return false;
        }
        return syncJob !== null && syncJob.id === props.syncJobId && syncJob.sync_id === resource.syncId && syncJob.run_id === taskId;
    }
    return props.syncId === undefined && props.syncJobId === undefined;
}
