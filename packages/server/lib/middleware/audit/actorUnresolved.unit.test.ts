import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { auditSyncCommand } from './sync.middleware.js';
import { auditTeamUpdated } from './team.middleware.js';
import { fakeReq, fakeRes, getConnectionByIdMock, installAuditMockDefaults, locals, resetAuditMocks, runAudit } from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

// Every tail that resolves an actor counts an unresolved one; the resource tag keeps the deliberate
// cases separable from the surprising ones.
describe('unresolved actor (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        getConnectionByIdMock.mockReset().mockResolvedValue({ environment_id: 9, provider_config_key: 'github', connection_id: 'conn-abc' });
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('counts an event that names nobody on a route with no actor of its own', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        const { user, ...withoutUser } = locals;

        const event = await runAudit(auditTeamUpdated, fakeReq({ body: { name: 'acme' } }), fakeRes(withoutUser));

        expect(event.actor).toEqual({ type: 'unknown', id: 'unknown', display: 'unknown' });
        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field: 'actor', resource: 'team' });
    });

    it('counts the legacy /sync/command tail, which resolves its own actor from the request', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        const { user, ...withoutUser } = locals;
        const req = fakeReq({ body: { command: 'PAUSE', nango_connection_id: 1, sync_name: 'test-sync' } });

        const event = await runAudit(auditSyncCommand, req, fakeRes(withoutUser));

        expect(event.actor).toEqual({ type: 'unknown', id: 'unknown', display: 'unknown' });
        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field: 'actor', resource: 'sync' });
    });
});
