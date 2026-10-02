import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditAgentSessionCreated, auditAgentSessionTerminated } from './agentSession.middleware.js';
import { fakeReq, fakeRes, installAuditMockDefaults, recordMock, resetAuditMocks, runAudit, secretKeyLocals } from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

const SESSION_ID = '3f2a1b00-0000-4000-8000-000000000001';

describe('agent session audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('session create: names the key that minted the session and never records the token', async () => {
        const req = fakeReq({ body: { tenant: { connections: { any: [{ tags: { team: 'ops' } }] } } } });
        const res = fakeRes(secretKeyLocals, 201);
        await new Promise<void>((resolve) => auditAgentSessionCreated(req, res, () => resolve()));
        res.json({
            data: {
                session_id: SESSION_ID,
                session_token: 'nango_agent_supersecret',
                mcp_url: 'https://api.nango.dev/session/x/mcp',
                expires_at: '2026-09-26T10:00:00.000Z',
                toolset: {},
                meta_tools: { nango_tool_search: true, nango_execute: true, nango_proxy: false }
            }
        });
        res.emit('finish');
        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        const event = recordMock.mock.calls.at(-1)?.[0];
        expect(event).toMatchObject({
            resource: 'agent_session',
            action: 'created',
            outcome: 'success',
            accountId: 42,
            scope: 'environment',
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
            targets: [{ type: 'agent_session', id: SESSION_ID }],
            metadata: { expiresAt: '2026-09-26T10:00:00.000Z' }
        });
        expect(JSON.stringify(event)).not.toContain('nango_agent_supersecret');
    });

    it('session terminate: names the session from the request, so a denial still identifies it', async () => {
        const event = await runAudit(auditAgentSessionTerminated, fakeReq({ params: { sessionId: SESSION_ID } }), fakeRes(secretKeyLocals, 403));
        expect(event).toMatchObject({
            resource: 'agent_session',
            action: 'terminated',
            outcome: 'denied',
            accountId: 42,
            scope: 'environment',
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
            targets: [{ type: 'agent_session', id: SESSION_ID }]
        });
    });

    it('session terminate: a malformed session id records the attempt with no target', async () => {
        const event = await runAudit(auditAgentSessionTerminated, fakeReq({ params: { sessionId: 'not-a-uuid' } }), fakeRes(secretKeyLocals, 400));
        expect(event).toMatchObject({ resource: 'agent_session', action: 'terminated', outcome: 'failure', accountId: 42, targets: [] });
    });
});
