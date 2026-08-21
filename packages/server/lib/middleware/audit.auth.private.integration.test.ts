import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { mfaService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { audit } from '../audit.js';
import { isSuccess, runServer } from '../utils/tests.js';
import { resetPasswordSecret } from '../utils/utils.js';

import type { AuditAction } from '@nangohq/audit';
import type * as NangoShared from '@nangohq/shared';
import type { DBUser } from '@nangohq/types';
import type { MockInstance } from 'vitest';

// The single auth-audit integration suite. auditAuth is a dedicated middleware whose whole job is to
// resolve the actor from the real login flow (session cookie, req.user after req.login, pending-MFA
// session, JWT reset token, WorkOS SSO callback with a 302). These cases genuinely need the live
// stack — the value under test IS the integration with the auth flow — so they stay integration and
// are consolidated here (local flows + managed/SSO flows) rather than moved to the unit harness.

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

// Every account here is created by the signup route, so it is always on the free plan — and the signup
// event fires before any plan could be updated. Entitle the lookup instead; the gate itself is covered
// in utils/auditTrail.unit.test.ts.
vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    return { ...actual, getPlanSafe: () => Promise.resolve({ has_audit_trail_control_plane: true }) };
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
const signinRoute = '/api/v1/account/signin';
const logoutRoute = '/api/v1/account/logout';
const resetPasswordRoute = '/api/v1/account/reset-password';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

// A test that signs in before acting records an app_auth/login first, so select the event under test
// by its action rather than by position.
function authEvent(action: AuditAction) {
    return auditSpy.mock.calls.map((call) => call[0]).find((event) => event.action === action);
}

async function signupVerifiedUser(): Promise<{ email: string; password: string; user: DBUser }> {
    const email = `${nanoid()}@example.com`;
    const password = 'aZ1-foobar!?';
    const res = await api.fetch(signupRoute, {
        method: 'POST',
        body: { email, name: 'Foobar', password, foundUs: 'tests' } as any
    });
    expect(res.res.status).toBe(200);

    const user = await userService.getUserByEmail(email);
    await vi.waitFor(() => {
        expect(auditSpy.mock.calls.some((c) => c[0]?.action === 'signup' && c[0].actor.id === String(user!.id))).toBe(true);
    });
    await userService.verifyUserEmail(user!.id);

    return { email, password, user: user! };
}

async function enrollMfaUser(): Promise<{ email: string; password: string; user: DBUser; totp: OTPAuth.TOTP }> {
    const { email, password, user } = await signupVerifiedUser();
    const enrollment = (await mfaService.startEnrollment(user.id, email)).unwrap();
    const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
    (await mfaService.activateEnrollment(user.id, totp.generate())).unwrap();
    return { email, password, user, totp };
}

async function signin(email: string, password: string): Promise<string> {
    const before = auditSpy.mock.calls.length;
    const { res } = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
    expect(res.status).toBe(200);
    await vi.waitFor(() => {
        expect(auditSpy.mock.calls.slice(before).some((call) => call[0]?.action === 'login')).toBe(true);
    });
    const cookie = res.headers.getSetCookie()[0];
    return cookie!.split(';')[0]!;
}

describe('audit — auth flows', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        // getFlags() returns the stable noop facade in tests; roll the audit flag out to every account. MFA
        // is forced on too so an enrolled user's sign-in takes the pending-MFA path.
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
        vi.spyOn(featureFlags.getFlags(), 'isMFAEnabled').mockResolvedValue(true);
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

    describe('local (email/password)', () => {
        it('records app_auth/login on a successful sign-in', async () => {
            const { email, password, user } = await signupVerifiedUser();
            // Signing up already emits an audit event; only the sign-in under test should be asserted.
            auditSpy.mockClear();

            const { res } = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
            expect(res.status).toBe(200);

            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalled();
            });
            expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
                resource: 'app_auth',
                action: 'login',
                outcome: 'success',
                accountId: user.account_id,
                environment: null,
                actor: { type: 'user', id: String(user.id), display: user.email },
                targets: [{ type: 'user', id: String(user.id), display: user.email }],
                metadata: { mfaRequired: false }
            });
        });

        it('records app_auth/login with metadata.mfaRequired true when the sign-in starts an MFA challenge', async () => {
            const { email, password, user } = await enrollMfaUser();
            auditSpy.mockClear();

            const { res, json } = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
            expect(res.status).toBe(200);
            // The password step returns mfaRequired and stashes pendingMfaLogin; the login event is recorded here.
            expect(json).toEqual({ data: { mfaRequired: true } });

            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalled();
            });
            expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
                resource: 'app_auth',
                action: 'login',
                outcome: 'success',
                accountId: user.account_id,
                environment: null,
                actor: { type: 'user', id: String(user.id), display: user.email },
                metadata: { mfaRequired: true }
            });
        });

        it('records app_auth/login with outcome denied on a wrong-password attempt', async () => {
            const { email, user } = await signupVerifiedUser();
            auditSpy.mockClear();

            const { res } = await api.fetch(signinRoute, { method: 'POST', body: { email, password: 'aZ1-WRONGpass!?' } });
            expect(res.status).toBe(401);

            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalled();
            });
            // The rejected attempt maps to the target account, but the actor is anonymous — a wrong-password
            // attempt against someone's email must never frame the victim as the one acting.
            expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
                resource: 'app_auth',
                action: 'login',
                outcome: 'denied',
                accountId: user.account_id,
                environment: null,
                actor: { type: 'anonymous', id: 'unknown', display: 'anonymous' },
                targets: [{ type: 'user', id: String(user.id), display: user.email }]
            });
        });

        it('does not record a login for an email that maps to no account', async () => {
            const { res } = await api.fetch(signinRoute, { method: 'POST', body: { email: `${nanoid()}@example.com`, password: 'aZ1-foobar!?' } });
            expect(res.status).toBe(401);

            // Give the finish hook a chance to run; an unknown email must not produce an audit event.
            await new Promise((resolve) => setTimeout(resolve, 200));
            expect(auditSpy).not.toHaveBeenCalled();
        });

        it('records app_auth/signup on a successful sign-up', async () => {
            const email = `${nanoid()}@example.com`;
            const password = 'aZ1-foobar!?';

            const res = await api.fetch(signupRoute, {
                method: 'POST',
                body: { email, name: 'Foobar', password, foundUs: 'tests' } as any
            });
            expect(res.res.status).toBe(200);

            const user = await userService.getUserByEmail(email);
            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalled();
            });
            expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
                resource: 'app_auth',
                action: 'signup',
                outcome: 'success',
                accountId: user!.account_id,
                environment: null,
                actor: { type: 'user', id: String(user!.id), display: user!.email },
                targets: [{ type: 'user', id: String(user!.id), display: user!.email }]
            });
        });

        it('records app_auth/logout on a successful logout', async () => {
            const { email, password, user } = await signupVerifiedUser();
            const session = await signin(email, password);

            // logout replies 200 with an empty body; api.fetch's res.json() would throw, so use a raw fetch.
            const res = await fetch(`${api.url}${logoutRoute}`, { method: 'POST', headers: { Cookie: session } });
            expect(res.status).toBe(200);

            await vi.waitFor(() => {
                expect(authEvent('logout')).toBeDefined();
            });
            expect(authEvent('logout')).toMatchObject({
                resource: 'app_auth',
                action: 'logout',
                outcome: 'success',
                accountId: user.account_id,
                environment: null,
                actor: { type: 'user', id: String(user.id), display: user.email },
                targets: [{ type: 'user', id: String(user.id), display: user.email }]
            });
        });

        it('records app_auth/password_reset on a successful reset', async () => {
            const { email, user } = await signupVerifiedUser();
            auditSpy.mockClear();

            const token = jwt.sign({ user: email }, resetPasswordSecret(), { expiresIn: '10m' });
            await userService.editUserPassword({ id: user.id, reset_password_token: token, hashed_password: user.hashed_password });

            const { res, json } = await api.fetch(resetPasswordRoute, {
                method: 'PUT',
                body: { token, password: 'aZ1-newpass!?' }
            });
            expect(res.status).toBe(200);
            isSuccess(json);

            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalled();
            });
            expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
                resource: 'app_auth',
                action: 'password_reset',
                outcome: 'success',
                accountId: user.account_id,
                environment: null,
                actor: { type: 'user', id: String(user.id), display: user.email },
                targets: [{ type: 'user', id: String(user.id), display: user.email }]
            });
        });
    });

    describe('managed / SSO', () => {
        it('records app_auth/login (method sso) when the SSO callback logs an existing user in', async () => {
            const { user } = await signupVerifiedUser();
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
                accountId: user.account_id,
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
            expect(res.headers.get('location')).toBe('http://localhost:3003/onboarding/account-discovery');

            const user = await userService.getUserByEmail(email);
            expect(user).not.toBeNull();

            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalled();
            });
            expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
                resource: 'app_auth',
                action: 'signup',
                outcome: 'success',
                accountId: user!.account_id,
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

        it('does not record a login when a failed SSO attempt is made with an existing session', async () => {
            // An already-signed-in user has req.user populated by passport.session(). A FAILED SSO attempt
            // must not be recorded as a successful login for them — it never called req.login this request.
            const { email, password } = await signupVerifiedUser();
            const session = await signin(email, password);
            auditSpy.mockClear();
            workosMocks.authenticateWithCode.mockRejectedValue(Object.assign(new Error('invalid'), { error: 'invalid_grant' }));

            const res = await fetch(`${api.url}/api/v1/login/callback?code=bad_code`, { headers: { Cookie: session }, redirect: 'manual' });
            expect(res.status).toBe(302);
            expect(res.headers.get('location')).toBe('http://localhost:3003/signin?error=sso_session_expired');

            // Fire-and-forget finish hook: give it a tick, then confirm nothing was recorded despite req.user.
            await new Promise((resolve) => setTimeout(resolve, 200));
            expect(auditSpy).not.toHaveBeenCalled();
        });

        it('records app_auth/login (method managed) on a successful email-verification login', async () => {
            const { user } = await signupVerifiedUser();

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
                accountId: user.account_id,
                environment: null,
                actor: { type: 'user', id: String(user.id), display: user.email },
                targets: [{ type: 'user', id: String(user.id), display: user.email }],
                metadata: { mfaRequired: false, method: 'managed' }
            });
        });
    });
});
