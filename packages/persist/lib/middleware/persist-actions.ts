import { TASK_CAPABILITY_ACTIONS } from '@nangohq/internal-auth';

function requestPath(req: { originalUrl: string; path: string }): string {
    const raw = (req.originalUrl || req.path).split('?')[0] ?? '';
    return raw.replace(/\/+$/, '') || '/';
}

export function persistActionForRequest(req: { method: string; originalUrl: string; path: string }): string | null {
    const path = requestPath(req);
    if (path.endsWith('/log')) {
        return TASK_CAPABILITY_ACTIONS.persistLog;
    }
    if (path.includes('/runner/telemetry')) {
        return TASK_CAPABILITY_ACTIONS.persistTelemetry;
    }
    if (path.includes('/runner/task/') && path.endsWith('/abort')) {
        return TASK_CAPABILITY_ACTIONS.persistAbort;
    }
    if (path.includes('/runner/sync-conflict')) {
        return TASK_CAPABILITY_ACTIONS.persistSyncConflict;
    }
    if (path.includes('/runner/locks')) {
        return TASK_CAPABILITY_ACTIONS.persistLocks;
    }
    if (path.includes('/checkpoint')) {
        return TASK_CAPABILITY_ACTIONS.persistCheckpoint;
    }
    if (path.includes('/cursor')) {
        return TASK_CAPABILITY_ACTIONS.persistCursor;
    }
    if (path.includes('/records') || path.includes('/outdated')) {
        return TASK_CAPABILITY_ACTIONS.persistRecords;
    }
    return null;
}
