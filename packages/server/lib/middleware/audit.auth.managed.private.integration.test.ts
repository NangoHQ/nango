import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { audit } from '../audit.js';
import { runServer } from '../utils/tests.js';

import type { DBUser } from '@nangohq/types';
import type { MockInstance } from 'vitest';

const workosMocks = vi.hoisted(() => {
    process.env['FLAG_MANAGED_AUTH_ENABLED'] = 'true';
    process.env['WORKOS_API_KEY'] = 'sk_test_123';
    process.env['WORKOS_CLIENT_ID'] = 'client_test_123';
    process.env['AUTH_ALLOW_SIGNUP'] = 'true';
    process.env['NANGO_SERVER_URL'] = 'http://localhost:3003';
    process.env['NANGO_PUBLIC_SERVER_URL'] = 'http://localhost:3003';

    return {
        authenticateWithCode: vi.fn(),
        authenticateWithEmailVerification: vi.fn(),
        getOrganization: vi.fn()
    };
});

vi.mock('../clients/workos.client.js', () => ({
    getWorkOSClient: () => ({
        userManagement: {
            authenticateWithCode: workosMocks.authenticateWithCode,
            authenticateWithEmailVerification: workosMocks.authenticateWithEmailVerification
        },
        organizations: {
            getOrganization: workosMocks.getOrganization
        }
    })
}));

const signupRoute = '/api/v1/account/signup';
const verifyCodeRoute = '/api/v1/account/verify/code';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

async function signupUser({ verified }: { verified: boolean }): Promise<DBUser> {
    const email = `${nanoid()}@example.com`;
    const password = 'aZ1-foobar!?';
    const res = await api.fetch(signupRoute, {
        method: 'POST',
        body: { email, name: 'Foobar', password, foundUs: 'tests' } as any
    });
    expect(res.res.status).toBe(200);
    const user = await userService.getUserByEmail(email);
    // The signup route emits its own audit event on finish; wait for it to flush so a subsequent
    // mockClear in the test is deterministic and doesn't leave this event racing into the next assertion.
    await vi.waitFor(() => {
        expect(auditSpy.mock.calls.some((c) => c[0]?.action === 'signup' && c[0].actor.id === String(user!.id))).toBe(true);
    });
    if (verified) {
        await userService.verifyUserEmail(user!.id);
    }
    return user!;
}

describe('managed/SSO auth audit middleware (private API)', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        workosMocks.authenticateWithCode.mockReset();
        workosMocks.authenticateWithEmailVerification.mockReset();
        auditSpy.mockClear();
    });

    it('records app_auth/login (method sso) when the SSO callback logs an existing user in', async () => {
        const user = await signupUser({ verified: true });
        auditSpy.mockClear();

        workosMocks.authenticateWithCode.mockResolvedValue({
            user: { email: user.email, firstName: 'Managed', lastName: 'User' },
            organizationId: undefined
        });

        const res = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123`, { redirect: 'manual' });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('http://localhost:3003/');

        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'app_auth',
            action: 'login',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            metadata: { mfaRequired: false, method: 'sso' }
        });
    });

    it('records app_auth/signup when the SSO callback creates a new user', async () => {
        const email = `${nanoid()}@example.com`;

        workosMocks.authenticateWithCode.mockResolvedValue({
            user: { email, firstName: 'Managed', lastName: 'User' },
            organizationId: undefined
        });

        expect(await userService.getUserByEmail(email)).toBeNull();

        const res = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123`, { redirect: 'manual' });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('http://localhost:3003/onboarding/hear-about-us');

        const user = await userService.getUserByEmail(email);
        expect(user).not.toBeNull();

        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'app_auth',
            action: 'signup',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user!.id), display: user!.email },
            targets: [{ type: 'user', id: String(user!.id), display: user!.email }]
        });
    });

    it('does not record an event when the SSO callback rejects an invalid code', async () => {
        workosMocks.authenticateWithCode.mockRejectedValue(Object.assign(new Error('invalid'), { error: 'invalid_grant' }));

        const res = await fetch(`${api.url}/api/v1/login/callback?code=bad_code`, { redirect: 'manual' });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('http://localhost:3003/signin?error=sso_session_expired');

        // No session was established, so there is no actor to attribute the failed attempt to — skip.
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it('records app_auth/login (method email_code) on a successful verify-code login', async () => {
        const user = await signupUser({ verified: false });
        const token = user.email_verification_token;
        expect(token).toBeTruthy();
        auditSpy.mockClear();

        const { res } = await api.fetch(verifyCodeRoute, { method: 'POST', body: { token: token! } });
        expect(res.status).toBe(200);

        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'app_auth',
            action: 'login',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            metadata: { mfaRequired: false, method: 'email_code' }
        });
    });

    it('records app_auth/login (method managed) on a successful email-verification login', async () => {
        const user = await signupUser({ verified: true });

        // First hop: the SSO callback rejects with email_verification_required and stashes the pending
        // verification in the session. No session is established yet, so no audit event is emitted here.
        workosMocks.authenticateWithCode.mockRejectedValue({
            rawData: {
                code: 'email_verification_required',
                message: 'Email ownership must be verified before authentication.',
                pending_authentication_token: 'pending_token_123',
                email: user.email,
                email_verification_id: 'email_verification_123'
            }
        });

        const callbackRes = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123`, { redirect: 'manual' });
        expect(callbackRes.status).toBe(302);
        expect(callbackRes.headers.get('location')).toBe('http://localhost:3003/signin/verify');
        const sessionCookie = callbackRes.headers.getSetCookie()[0]?.split(';')[0];
        expect(sessionCookie).toBeTruthy();

        auditSpy.mockClear();

        // Second hop: the verification code succeeds and the existing user is logged in.
        workosMocks.authenticateWithEmailVerification.mockResolvedValue({
            user: { email: user.email, firstName: 'Managed', lastName: 'User' },
            organizationId: undefined
        });

        const verifyRes = await api.fetch('/api/v1/account/managed/verification', {
            method: 'POST',
            session: sessionCookie!,
            body: { code: '123456' }
        });
        expect(verifyRes.res.status).toBe(200);

        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'app_auth',
            action: 'login',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            metadata: { mfaRequired: false, method: 'managed' }
        });
    });
});
