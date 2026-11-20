import { isResourceBound } from '@nangohq/internal-auth';

import type { InternalServiceAuth } from '@nangohq/internal-auth';

/**
 * A jobs task capability token carries `res`. The body must name that environment,
 * connection, and sync. `syncJobId` is not a claim: the sync job row created for
 * this orchestrator task (`run_id`) is the authoritative id.
 *
 * `isResourceBound` is false when the claim is absent, so an action token (no `syncId`)
 * is checked here: the body must not name a sync or a sync job either.
 */
export function taskPropsBoundToCapability(
    auth: InternalServiceAuth | undefined,
    props: {
        environmentId: number;
        nangoConnectionId: number;
        syncId?: string | undefined;
        syncJobId?: number | undefined;
    },
    taskId: string,
    syncJob: { id: number; sync_id: string; run_id?: string | null | undefined } | null
): boolean {
    if (!isResourceBound(auth, 'environmentId', props.environmentId) || !isResourceBound(auth, 'connectionId', props.nangoConnectionId)) {
        return false;
    }
    const syncId = auth?.res?.syncId;
    if (syncId) {
        if (!isResourceBound(auth, 'syncId', props.syncId) || props.syncJobId === undefined) {
            return false;
        }
        return syncJob !== null && syncJob.id === props.syncJobId && syncJob.sync_id === syncId && syncJob.run_id === taskId;
    }
    return props.syncId === undefined && props.syncJobId === undefined;
}
