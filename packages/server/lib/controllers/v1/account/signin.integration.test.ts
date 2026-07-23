import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { mfaService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { isError, isSuccess, runServer } from '../../../utils/tests.js';

import type { DBUser } from '@nangohq/types';

const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';

let api: Awaited<ReturnType<typeof runServer>>;

async function signupUser({ emailVerified }: { emailVerified: boolean }): Promise<{ email: string; password: string }> {
    const email = `${nanoid()}@example.com`;
    const password = 'aZ1-foobar!?';

    const signupRes = await api.fetch(signupRoute, {
        method: 'POST',
        body: { email, name: 'Foobar', password, foundUs: 'tests' } as any
    });

    expect(signupRes.res.status).toBe(200);
    isSuccess(signupRes.json);
    expect(signupRes.json.data.verified).toBe(false);

    if (emailVerified) {
        const createdUser = await userService.getUserByEmail(email);
        expect(createdUser).toBeTruthy();
        await userService.verifyUserEmail(createdUser!.id);
    }

    return { email, password };
}

async function enrollMfaUser(): Promise<{ email: string; password: string; user: DBUser; totp: OTPAuth.TOTP }> {
    const { email, password } = await signupUser({ emailVerified: true });
    const user = await userService.getUserByEmail(email);
    expect(user).toBeTruthy();
    const enrollment = (await mfaService.startEnrollment(user!.id, email)).unwrap();
    const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
    (await mfaService.activateEnrollment(user!.id, totp.generate())).unwrap();
    return { email, password, user: user!, totp };
}

describe(`POST ${signinRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
        vi.spyOn(featureFlags.getFlags(), 'isMFAEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    it('should not set a session cookie when the body is invalid (even if credentials are valid)', async () => {
        const { email, password } = await signupUser({ emailVerified: true });

        const { res, json } = await api.fetch(signinRoute, {
            method: 'POST',
            body: { email, password, verified: true } as any
        });

        expect(res.status).toBe(400);
        isError(json);
        expect(json.error.code).toBe('invalid_body');
        expect(res.headers.getSetCookie()).toHaveLength(0);
    });

    it('should not set a session cookie when email is not verified', async () => {
        const { email, password } = await signupUser({ emailVerified: false });

        const { res, json } = await api.fetch(signinRoute, {
            method: 'POST',
            body: { email, password }
        });

        expect(res.status).toBe(400);
        isError(json);
        expect(json).toStrictEqual({ error: { code: 'email_not_verified' } });
        expect(res.headers.getSetCookie()).toHaveLength(0);
    });

    it('should set a session cookie on successful verified login', async () => {
        const { email, password } = await signupUser({ emailVerified: true });

        const { res, json } = await api.fetch(signinRoute, {
            method: 'POST',
            body: { email, password }
        });

        expect(res.status).toBe(200);
        isSuccess(json);
        expect(json).toHaveProperty('user');

        const cookies = res.headers.getSetCookie();
        expect(cookies.length).toBeGreaterThan(0);
        expect(cookies[0]).toMatch(/^nango_session=/);
    });

    it('requires MFA verification before issuing an authenticated session', async () => {
        const { email, password, user, totp } = await enrollMfaUser();
        expect(await mfaService.hasActiveFactor(user.id)).toBe(true);

        const signinResponse = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
        expect(signinResponse.res.status).toBe(200);
        isSuccess(signinResponse.json);
        expect(signinResponse.json).toEqual({ data: { mfaRequired: true } });
        const pendingSession = signinResponse.res.headers.getSetCookie()[0]!.split(';')[0]!;

        const userResponse = await api.fetch('/api/v1/user', { method: 'GET', session: pendingSession });
        expect(userResponse.res.status).toBe(401);

        const verification = await api.fetch('/api/v1/account/mfa/login/verify', {
            method: 'POST',
            session: pendingSession,
            body: { type: 'code', code: totp.generate({ timestamp: Date.now() + 30_000 }) }
        });
        expect(verification.res.status).toBe(200);
        isSuccess(verification.json);
        expect(verification.json.data.user.email.toLowerCase()).toBe(email.toLowerCase());
    });

    it('returns the requested returnTo after MFA verification', async () => {
        const { email, password, totp } = await enrollMfaUser();

        const signinResponse = await api.fetch(signinRoute, { method: 'POST', body: { email, password, returnTo: '/integrations' } });
        const pendingSession = signinResponse.res.headers.getSetCookie()[0]!.split(';')[0]!;

        const verification = await api.fetch('/api/v1/account/mfa/login/verify', {
            method: 'POST',
            session: pendingSession,
            body: { type: 'code', code: totp.generate({ timestamp: Date.now() + 30_000 }) }
        });
        expect(verification.res.status).toBe(200);
        isSuccess(verification.json);
        expect(verification.json.data.url).toBe('/integrations');
    });

    it('sanitizes unsafe returnTo values to root', async () => {
        const unsafeReturnTos = ['//evil.com', '/\t//evil.com', '/\n//evil.com', '/\\evil.com', 'https://evil.com'];

        for (const returnTo of unsafeReturnTos) {
            const { email, password, totp } = await enrollMfaUser();

            const signinResponse = await api.fetch(signinRoute, { method: 'POST', body: { email, password, returnTo } });
            const pendingSession = signinResponse.res.headers.getSetCookie()[0]!.split(';')[0]!;

            const verification = await api.fetch('/api/v1/account/mfa/login/verify', {
                method: 'POST',
                session: pendingSession,
                body: { type: 'code', code: totp.generate({ timestamp: Date.now() + 30_000 }) }
            });
            expect(verification.res.status).toBe(200);
            isSuccess(verification.json);
            expect(verification.json.data.url, `returnTo=${JSON.stringify(returnTo)}`).toBe('/');
        }
    });

    it('rejects an expired MFA challenge', async () => {
        const verification = await api.fetch('/api/v1/account/mfa/login/verify', { method: 'POST', body: { type: 'code', code: '123456' } });

        expect(verification.res.status).toBe(400);
        isError(verification.json);
        expect(verification.json.error.code).toBe('mfa_login_expired');
    });

    it('rejects MFA verification when the user is suspended during the challenge', async () => {
        const { email, password, user, totp } = await enrollMfaUser();

        const signinResponse = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
        const pendingSession = signinResponse.res.headers.getSetCookie()[0]!.split(';')[0]!;
        await userService.suspendUser(user.id);

        const verification = await api.fetch('/api/v1/account/mfa/login/verify', {
            method: 'POST',
            session: pendingSession,
            body: { type: 'code', code: totp.generate({ timestamp: Date.now() + 30_000 }) }
        });

        expect(verification.res.status).toBe(400);
        isError(verification.json);
        expect(verification.json.error.code).toBe('invalid_mfa_code');
    });
});
