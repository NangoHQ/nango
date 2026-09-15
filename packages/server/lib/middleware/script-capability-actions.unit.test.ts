import { describe, expect, it } from 'vitest';

import { TASK_CAPABILITY_ACTIONS } from '@nangohq/internal-auth';

import { scriptActionForRequest } from './script-capability-actions.js';

describe('scriptActionForRequest', () => {
    it('maps script-allowed public routes', () => {
        expect(scriptActionForRequest({ method: 'GET', path: '/connections/abc' })).toBe(TASK_CAPABILITY_ACTIONS.apiConnectionRead);
        expect(scriptActionForRequest({ method: 'GET', path: '/integrations/slack' })).toBe(TASK_CAPABILITY_ACTIONS.apiIntegrationRead);
        expect(scriptActionForRequest({ method: 'POST', path: '/connections/metadata' })).toBe(TASK_CAPABILITY_ACTIONS.apiMetadataWrite);
        expect(scriptActionForRequest({ method: 'GET', path: '/environment-variables' })).toBe(TASK_CAPABILITY_ACTIONS.apiEnvVarsRead);
        expect(scriptActionForRequest({ method: 'POST', path: '/sync/trigger' })).toBe(TASK_CAPABILITY_ACTIONS.apiSyncTrigger);
        expect(scriptActionForRequest({ method: 'POST', path: '/sync/start' })).toBe(TASK_CAPABILITY_ACTIONS.apiSyncTrigger);
        expect(scriptActionForRequest({ method: 'POST', path: '/action/trigger' })).toBe(TASK_CAPABILITY_ACTIONS.apiActionTrigger);
        expect(scriptActionForRequest({ method: 'GET', path: '/proxy/issues' })).toBe(TASK_CAPABILITY_ACTIONS.apiProxy);
    });

    it('rejects non-script public routes', () => {
        expect(scriptActionForRequest({ method: 'GET', path: '/connections' })).toBeNull();
        expect(scriptActionForRequest({ method: 'POST', path: '/integrations' })).toBeNull();
        expect(scriptActionForRequest({ method: 'GET', path: '/api/v1/account/api-keys' })).toBeNull();
        expect(scriptActionForRequest({ method: 'DELETE', path: '/connections/abc' })).toBeNull();
    });
});
