import { TASK_CAPABILITY_ACTIONS } from '@nangohq/internal-auth';

export function scriptActionForRequest(req: { method: string; path: string; originalUrl?: string }): string | null {
    const raw = req.path || req.originalUrl?.split('?')[0] || '';
    const path = raw.replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase();

    if (path.startsWith('/proxy')) {
        return TASK_CAPABILITY_ACTIONS.apiProxy;
    }
    if (method === 'GET' && path === '/environment-variables') {
        return TASK_CAPABILITY_ACTIONS.apiEnvVarsRead;
    }
    if ((method === 'POST' || method === 'PATCH') && path === '/connections/metadata') {
        return TASK_CAPABILITY_ACTIONS.apiMetadataWrite;
    }
    if (method === 'GET' && /^\/connections\/[^/]+$/.test(path)) {
        return TASK_CAPABILITY_ACTIONS.apiConnectionRead;
    }
    if (method === 'GET' && /^\/integrations\/[^/]+$/.test(path)) {
        return TASK_CAPABILITY_ACTIONS.apiIntegrationRead;
    }
    if (method === 'POST' && (path === '/sync/trigger' || path === '/sync/start')) {
        return TASK_CAPABILITY_ACTIONS.apiSyncTrigger;
    }
    if (method === 'POST' && path === '/action/trigger') {
        return TASK_CAPABILITY_ACTIONS.apiActionTrigger;
    }
    return null;
}
