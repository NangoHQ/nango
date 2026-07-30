import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { seeders, updatePlan, userService } from '@nangohq/shared';

import { audit } from '../audit.js';
import { authenticateUser, isSuccess, runServer } from '../utils/tests.js';

import type { MockInstance } from 'vitest';

// POC — what remains after the strategy shift.
//
// The middleware's pure logic (event shape, redaction, outcome mapping, resolve-before-next mechanics)
// now lives in auditable.unit.test.ts, and the "audit runs after auth / before authz so denials are
// captured" guarantee is enforced across every route by auditWiring (unit + one real-table sweep).
//
// The only cases kept here are the ones a fake req/res cannot honestly reproduce: the audit target or
// metadata is resolved from state that a REAL controller mutates (the pre-change role, a removed
// member's email — both only knowable if resolved before the handler ran) or from a REAL authorization
// rejection (cross-account). These assert the middleware's contract with the live stack, not its logic.
//
// Deleted from this file and covered off-stack:
//   - deleted connection, connection update (changed fields), environment variables, webhook URLs
//     -> auditable.unit.test.ts  (event shape + redaction, no containers)
//   - denied member role change -> auditWiring (denial capture is now a structural guarantee)

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

describe('audit middleware — live-stack contract (private API)', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        // getFlags() returns the stable noop facade in tests; force the audit trail on.
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        auditSpy.mockClear();
    });

    it('captures the pre-change role — resolved before the controller overwrites it', async () => {
        const { account, user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        const targetUser = await seeders.seedUser(account.id);
        // Pin a known starting role; the controller overwrites it, so fromRole proves we resolved before it ran.
        await userService.update({ id: targetUser.id, role: 'development_full_access' });
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/team/users/:id', {
            method: 'PATCH',
            session,
            query: { env: 'dev' },
            params: { id: targetUser.id },
            body: { role: 'production_support' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'member',
            action: 'role_changed',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'member', id: String(targetUser.id), display: targetUser.email }],
            metadata: { fromRole: 'development_full_access', toRole: 'production_support' }
        });
    });

    it('does not leak a cross-account member email into the target display', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const other = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Target a member that belongs to a DIFFERENT account. The controller rejects it, but the point
        // is that the audit event must not carry the other account's email in the target display.
        const res = await api.fetch('/api/v1/team/users/:id', {
            method: 'PATCH',
            session,
            query: { env: 'dev' },
            params: { id: other.user.id },
            body: { role: 'administrator' }
        });

        expect(res.res.status).toBe(400);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        const event = auditSpy.mock.calls[0]?.[0];
        expect(event).toMatchObject({
            resource: 'member',
            action: 'role_changed',
            targets: [{ type: 'member', id: String(other.user.id) }]
        });
        expect(event?.targets[0]).not.toHaveProperty('display');
    });

    it('captures a removed member email resolved before the controller moves the row', async () => {
        const { account, user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        const targetUser = await seeders.seedUser(account.id);
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/team/users/:id', {
            method: 'DELETE',
            session,
            query: { env: 'dev' },
            params: { id: targetUser.id }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        // The controller moves the member out of the account, so the email is only knowable if the
        // target was resolved before the handler ran — this guards the resolve-before-next() timing.
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'member',
            action: 'removed',
            outcome: 'success',
            targets: [{ type: 'member', id: String(targetUser.id), display: targetUser.email }]
        });
    });
});
