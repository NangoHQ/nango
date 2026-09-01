import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { auditConnectionCreated } from './connection.middleware.js';
import { auditTeamUpdated } from './team.middleware.js';
import { fakeReq, fakeRes, installAuditMockDefaults, locals, resetAuditMocks, runAudit } from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

// An `unknown` actor is the trail admitting it could not say who acted. On a route that authenticated the
// caller that is a gap worth counting; on a provider-completed connection it is the honest answer, and the
// spec that knows the difference is the one supplying its own actor.
describe('unresolved actor (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
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

    it('does not count a resolved actor', async () => {
        const increment = vi.spyOn(metrics, 'increment');

        await runAudit(auditTeamUpdated, fakeReq({ body: { name: 'acme' } }), fakeRes(locals));

        expect(increment).not.toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field: 'actor', resource: 'team' });
    });

    it('does not count a provider-completed connection, whose spec names nobody on purpose', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        const { user, ...withoutUser } = locals;
        const req = fakeReq({
            audit: {
                connectionUpsert: {
                    operation: 'creation',
                    connectionId: 'conn-1',
                    providerConfigKey: 'github',
                    account: locals.account,
                    environment: locals.environment
                }
            }
        });

        const event = await runAudit(auditConnectionCreated, req, fakeRes(withoutUser));

        expect(event.actor).toEqual({ type: 'unknown', id: 'unknown', display: 'unknown' });
        expect(increment).not.toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field: 'actor', resource: 'connection' });
    });
});
