import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import type { runServer as runServerType } from '../../../../utils/tests.js';

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

vi.mock('../../../../clients/workos.client.js', () => ({
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

const route = '/api/v1/account/managed/verification';

type RunServer = typeof runServerType;

let api: Awaited<ReturnType<RunServer>>;
let runServer: RunServer;

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        vi.resetModules();
        ({ runServer } = await import('../../../../utils/tests.js'));
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
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
        const email = `${nanoid()}@example.com`;
        const verificationCode = '123456';

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

        const callbackRes = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123`, {
            redirect: 'manual'
        });

        expect(callbackRes.status).toBe(302);
        expect(callbackRes.headers.get('location')).toBe('http://localhost:3003/signin/verify');

        const sessionCookie = callbackRes.headers.getSetCookie()[0]?.split(';')[0];
        expect(sessionCookie).toBeTruthy();

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
                url: 'http://localhost:3003/onboarding/hear-about-us'
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
            email,
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

        const callbackRes = await fetch(`${api.url}/api/v1/login/callback?code=oauth_code_123`, {
            redirect: 'manual'
        });

        const sessionCookie = callbackRes.headers.getSetCookie()[0]?.split(';')[0];
        expect(sessionCookie).toBeTruthy();

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
});
