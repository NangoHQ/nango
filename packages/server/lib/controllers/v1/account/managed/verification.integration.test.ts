import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { mfaService, seeders, userService } from '@nangohq/shared';
import { nanoid, normalizeEmail } from '@nangohq/utils';

import type { runServer as runServerType } from '../../../../utils/tests.js';
import type * as featureFlagsType from '@nangohq/feature-flags';

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
        getAuthorizationUrl: vi.fn().mockReturnValue('https://auth.example/authorize'),
        getOrganization: vi.fn()
    };
});

vi.mock('../../../../clients/workos.client.js', () => ({
    getWorkOSClient: () => ({
        userManagement: {
            authenticateWithCode: workosMocks.authenticateWithCode,
            authenticateWithEmailVerification: workosMocks.authenticateWithEmailVerification,
            getAuthorizationUrl: workosMocks.getAuthorizationUrl
        },
        organizations: {
            getOrganization: workosMocks.getOrganization
        }
    })
}));

const route = '/api/v1/account/managed/verification';

type RunServer = typeof runServerType;

let api: Awaited<ReturnType<RunServer>>;
let runServer: RunServer;
let featureFlags: typeof featureFlagsType;

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        vi.resetModules();
        ({ runServer } = await import('../../../../utils/tests.js'));
        featureFlags = await import('@nangohq/feature-flags');
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should redirect invalid WorkOS callback payloads to signin', async () => {
        const callbackRes = await fetch(`${api.url}/api/v1/login/callback?error=access_denied`, {
            redirect: 'manual'
        });

        expect(callbackRes.status).toBe(302);
        expect(callbackRes.headers.get('location')).toBe('http://localhost:3003/signin?error=sso_session_expired');
        expect(workosMocks.authenticateWithCode).not.toHaveBeenCalled();
    });

    it('should complete the pending WorkOS email verification flow and create the local user', async () => {
        const email = `MixedCase-${nanoid()}@Example.com`;
        const verificationCode = '123456';
        const next = '/oauth/authorize?interaction=test-interaction';

        workosMocks.authenticateWithCode.mockRejectedValue({
            rawData: {
                code: 'email_verification_required',
                message: 'Email ownership must be verified before authentication.',
                pending_authentication_token: 'pending_token_123',
                email,
                email_verification_id: 'email_verification_123'
            }
        });

        workosMocks.authenticateWithEmailVerification.mockResolvedValue({
            user: {
                email,
                firstName: 'Managed',
                lastName: 'User'
            },
            organizationId: undefined
        });

        expect(await userService.getUserByEmail(email)).toBeNull();

        const signupRes = await api.fetch('/api/v1/account/managed/signup', {
            method: 'POST',
            body: { provider: 'GoogleOAuth', next }
        });
        expect(signupRes.res.status).toBe(200);

        const sessionCookie = signupRes.res.headers.getSetCookie()[0]?.split(';')[0];
        const state = (workosMocks.getAuthorizationUrl.mock.calls[0]?.[0] as { state?: string } | undefined)?.state;
        expect(sessionCookie).toBeTruthy();
        expect(state).toBeTruthy();

        const callbackRes = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123&state=${encodeURIComponent(state!)}`, {
            headers: { Cookie: sessionCookie! },
            redirect: 'manual'
        });

        expect(callbackRes.status).toBe(302);
        expect(callbackRes.headers.get('location')).toBe('http://localhost:3003/signin/verify');

        const getVerificationRes = await api.fetch('/api/v1/account/managed/verification', {
            method: 'GET',
            session: sessionCookie!
        });

        expect(getVerificationRes.res.status).toBe(200);
        expect(getVerificationRes.json).toStrictEqual({
            data: {
                email
            }
        });

        const postVerificationRes = await api.fetch('/api/v1/account/managed/verification', {
            method: 'POST',
            session: sessionCookie!,
            body: {
                code: verificationCode
            }
        });

        expect(postVerificationRes.res.status).toBe(200);
        expect(postVerificationRes.json).toStrictEqual({
            data: {
                url: `http://localhost:3003/onboarding/account-discovery?next=${encodeURIComponent(next)}`
            }
        });

        expect(workosMocks.authenticateWithEmailVerification).toHaveBeenCalledWith(
            expect.objectContaining({
                clientId: 'client_test_123',
                code: verificationCode,
                pendingAuthenticationToken: 'pending_token_123'
            })
        );

        const createdUser = await userService.getUserByEmail(email);
        expect(createdUser).toMatchObject({
            email: normalizeEmail(email),
            email_verified: true,
            name: 'Managed User'
        });

        const verificationAfterSuccess = await api.fetch('/api/v1/account/managed/verification', {
            method: 'GET',
            session: sessionCookie!
        });

        expect(verificationAfterSuccess.res.status).toBe(404);
        expect(verificationAfterSuccess.json).toStrictEqual({
            error: {
                code: 'not_found',
                message: 'No pending WorkOS email verification was found. Please try signing in with Google again.'
            }
        });
    });

    it('should resume the original page after managed login for an existing user', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const next = '/oauth/authorize?interaction=test-interaction';

        workosMocks.authenticateWithCode.mockResolvedValue({
            user: {
                email: user.email,
                firstName: user.name,
                lastName: ''
            },
            organizationId: undefined
        });

        const signupRes = await api.fetch('/api/v1/account/managed/signup', {
            method: 'POST',
            body: { provider: 'GoogleOAuth', next }
        });
        const sessionCookie = signupRes.res.headers.getSetCookie()[0]?.split(';')[0];
        const state = (workosMocks.getAuthorizationUrl.mock.calls[0]?.[0] as { state?: string } | undefined)?.state;
        expect(signupRes.res.status).toBe(200);
        expect(sessionCookie).toBeTruthy();
        expect(state).toBeTruthy();

        const callbackRes = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123&state=${encodeURIComponent(state!)}`, {
            headers: { Cookie: sessionCookie! },
            redirect: 'manual'
        });

        expect(callbackRes.status).toBe(302);
        expect(callbackRes.headers.get('location')).toBe(`http://localhost:3003${next}`);

        const replayRes = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_456&state=${encodeURIComponent(state!)}`, {
            headers: { Cookie: sessionCookie! },
            redirect: 'manual'
        });
        expect(replayRes.status).toBe(302);
        expect(replayRes.headers.get('location')).toBe('http://localhost:3003/signin?error=sso_session_expired');
    });

    it('should reject an external post-login destination', async () => {
        const signupRes = await api.fetch('/api/v1/account/managed/signup', {
            method: 'POST',
            body: { provider: 'GoogleOAuth', next: 'https://attacker.example' }
        });

        expect(signupRes.res.status).toBe(400);
        expect(signupRes.json).toMatchObject({ error: { code: 'invalid_body' } });
        expect(workosMocks.getAuthorizationUrl).not.toHaveBeenCalled();
    });

    it('should rethrow unexpected structured WorkOS errors instead of masking them as invalid verification codes', async () => {
        const email = `${nanoid()}@example.com`;

        workosMocks.authenticateWithCode.mockRejectedValue({
            rawData: {
                code: 'email_verification_required',
                message: 'Email ownership must be verified before authentication.',
                pending_authentication_token: 'pending_token_123',
                email,
                email_verification_id: 'email_verification_123'
            }
        });

        workosMocks.authenticateWithEmailVerification.mockRejectedValue({
            rawData: {
                code: 'rate_limit_exceeded',
                message: 'Too many requests'
            }
        });

        const signupRes = await api.fetch('/api/v1/account/managed/signup', {
            method: 'POST',
            body: { provider: 'GoogleOAuth' }
        });
        const sessionCookie = signupRes.res.headers.getSetCookie()[0]?.split(';')[0];
        const state = (workosMocks.getAuthorizationUrl.mock.calls[0]?.[0] as { state?: string } | undefined)?.state;
        expect(sessionCookie).toBeTruthy();
        expect(state).toBeTruthy();

        const callbackRes = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123&state=${encodeURIComponent(state!)}`, {
            headers: { Cookie: sessionCookie! },
            redirect: 'manual'
        });
        expect(callbackRes.status).toBe(302);

        const postVerificationRes = await api.fetch('/api/v1/account/managed/verification', {
            method: 'POST',
            session: sessionCookie!,
            body: {
                code: '123456'
            }
        });

        expect(postVerificationRes.res.status).toBe(500);
        expect(postVerificationRes.json).toMatchObject({
            error: {
                code: 'generic_error_support'
            }
        });
    });

    it('should challenge MFA before completing a managed auth login', async () => {
        vi.spyOn(featureFlags.getFlags(), 'isMFAEnabled').mockResolvedValue(true);

        const { user } = await seeders.seedAccountEnvAndUser();
        const next = '/oauth/authorize?interaction=test-interaction';
        const enrollment = (await mfaService.startEnrollment(user.id, user.email)).unwrap();
        const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
        (await mfaService.activateEnrollment(user.id, totp.generate())).unwrap();

        workosMocks.authenticateWithCode.mockResolvedValue({
            user: { email: user.email, firstName: 'Managed', lastName: 'User' },
            organizationId: undefined
        });

        const signupRes = await api.fetch('/api/v1/account/managed/signup', {
            method: 'POST',
            body: { provider: 'GoogleOAuth', next }
        });
        const initialCookie = signupRes.res.headers.getSetCookie()[0]?.split(';')[0];
        const state = (workosMocks.getAuthorizationUrl.mock.calls[0]?.[0] as { state?: string } | undefined)?.state;
        expect(initialCookie).toBeTruthy();
        expect(state).toBeTruthy();

        const callbackRes = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123&state=${encodeURIComponent(state!)}`, {
            headers: { Cookie: initialCookie! },
            redirect: 'manual'
        });

        expect(callbackRes.status).toBe(302);
        expect(callbackRes.headers.get('location')).toBe('http://localhost:3003/signin/mfa');

        const sessionCookie = callbackRes.headers.getSetCookie()[0]?.split(';')[0];
        expect(sessionCookie).toBeTruthy();

        const beforeVerification = await api.fetch('/api/v1/account/mfa', { method: 'GET', session: sessionCookie! });
        expect(beforeVerification.res.status).toBe(401);

        const verification = await api.fetch('/api/v1/account/mfa/login/verify', {
            method: 'POST',
            session: sessionCookie!,
            // A fresh window, the activation code above is already consumed
            body: { type: 'code', code: totp.generate({ timestamp: Date.now() + 30_000 }) }
        });

        expect(verification.res.status).toBe(200);
        expect(verification.json).toMatchObject({ data: { url: next, user: { email: user.email } } });
    });

    it('should not challenge MFA when the user has no active factor', async () => {
        vi.spyOn(featureFlags.getFlags(), 'isMFAEnabled').mockResolvedValue(true);

        const { user } = await seeders.seedAccountEnvAndUser();

        workosMocks.authenticateWithCode.mockResolvedValue({
            user: { email: user.email, firstName: 'Managed', lastName: 'User' },
            organizationId: undefined
        });

        const signupRes = await api.fetch('/api/v1/account/managed/signup', {
            method: 'POST',
            body: { provider: 'GoogleOAuth' }
        });
        const sessionCookie = signupRes.res.headers.getSetCookie()[0]?.split(';')[0];
        const state = (workosMocks.getAuthorizationUrl.mock.calls[0]?.[0] as { state?: string } | undefined)?.state;
        expect(sessionCookie).toBeTruthy();
        expect(state).toBeTruthy();

        const callbackRes = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123&state=${encodeURIComponent(state!)}`, {
            headers: { Cookie: sessionCookie! },
            redirect: 'manual'
        });

        expect(callbackRes.status).toBe(302);
        expect(callbackRes.headers.get('location')).toBe('http://localhost:3003/');
    });
});
