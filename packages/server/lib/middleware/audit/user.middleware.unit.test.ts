import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeReq, fakeRes, installAuditMockDefaults, locals, resetAuditMocks, runAudit } from './testing.js';
import { auditUserUpdated } from './user.middleware.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('user audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('user update: records the fields it accepts, so a profile rename is not a banner dismissal', async () => {
        const req = fakeReq({ body: { name: 'Ada Lovelace' } });
        const event = await runAudit(auditUserUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'user',
            action: 'updated',
            outcome: 'success',
            accountId: 42,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'user', id: '7', display: 'dev@example.com' }],
            metadata: { name: 'Ada Lovelace' }
        });
        expect(event?.metadata).not.toHaveProperty('gettingStartedClosed');
    });

    it('user update: a dismissed banner is distinguishable from a rename', async () => {
        const req = fakeReq({ body: { gettingStartedClosed: true } });
        const event = await runAudit(auditUserUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({ resource: 'user', action: 'updated', accountId: 42, outcome: 'success' });
        expect(event?.metadata).toEqual({ gettingStartedClosed: true });
        expect(event?.metadata).not.toHaveProperty('name');
    });

    it.each([
        ['a non-string name', { name: 42 }],
        ['an empty name', { name: '' }],
        ['a non-boolean flag', { gettingStartedClosed: 'yes' }]
    ])('user update: %s cannot reach the row, since nothing has validated the body yet', async (_name, body) => {
        const req = fakeReq({ body });
        const event = await runAudit(auditUserUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({ resource: 'user', action: 'updated', accountId: 42 });
        expect(event?.metadata).toBeUndefined();
    });
});
