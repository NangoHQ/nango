import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { isError, isSuccess, runServer } from '../../../utils/tests.js';
import { resetPasswordSecret } from '../../../utils/utils.js';

import type { MockInstance } from 'vitest';

const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';
const resetPasswordRoute = '/api/v1/account/reset-password';
const userRoute = '/api/v1/user';
const accountDiscoveryRoute = '/api/v1/account/onboarding/account-discovery';
const mfaRoute = '/api/v1/account/mfa';

let api: Awaited<ReturnType<typeof runServer>>;
let mfaFlagSpy: MockInstance<ReturnType<typeof featureFlags.getFlags>['isMFAEnabled']>;

async function signupVerifiedUser(): Promise<{ email: string; password: string }> {
    const email = `${nanoid()}@example.com`;
    const password = 'aZ1-foobar!?';

    const signupRes = await api.fetch(signupRoute, {
        method: 'POST',
        body: { email, name: 'Foobar', password, foundUs: 'tests' } as any
    });
    expect(signupRes.res.status).toBe(200);

    const createdUser = await userService.getUserByEmail(email);
    await userService.verifyUserEmail(createdUser!.id);

    return { email, password };
}

async function signin(email: string, password: string): Promise<string> {
    const { res } = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie()[0];
    expect(cookie).toMatch(/^nango_session=/);
    return cookie!.split(';')[0]!;
}

async function enrollMfa(session: string): Promise<{ totp: OTPAuth.TOTP; recoveryCodes: string[] }> {
    const enrollment = await api.fetch(`${mfaRoute}/enroll`, { method: 'POST', session });
    expect(enrollment.res.status).toBe(200);
    isSuccess(enrollment.json);
    const totp = OTPAuth.URI.parse(enrollment.json.data.otpauthUri) as OTPAuth.TOTP;

    const activation = await api.fetch(`${mfaRoute}/activate`, { method: 'POST', session, body: { code: totp.generate() } });
    expect(activation.res.status).toBe(200);
    isSuccess(activation.json);

    return { totp, recoveryCodes: activation.json.data.recoveryCodes };
}

async function issueResetToken(email: string): Promise<string> {
    const dbUser = await userService.getUserByEmail(email);
    const token = jwt.sign({ user: email }, resetPasswordSecret(), { expiresIn: '10m' });
    await userService.editUserPassword({ id: dbUser!.id, reset_password_token: token, hashed_password: dbUser!.hashed_password });
    return token;
}

describe(`PUT ${resetPasswordRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
        mfaFlagSpy = vi.spyOn(featureFlags.getFlags(), 'isMFAEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    it('should invalidate all sessions after a password reset', async () => {
        const { email, password } = await signupVerifiedUser();

        const sessionA = await signin(email, password);
        const sessionB = await signin(email, password);

        expect((await api.fetch(userRoute, { method: 'GET', session: sessionA })).res.status).toBe(200);
        expect((await api.fetch(userRoute, { method: 'GET', session: sessionB })).res.status).toBe(200);

        const dbUser = await userService.getUserByEmail(email);
        const token = jwt.sign({ user: email }, resetPasswordSecret(), { expiresIn: '10m' });
        await userService.editUserPassword({ id: dbUser!.id, reset_password_token: token, hashed_password: dbUser!.hashed_password });

        const { res, json } = await api.fetch(resetPasswordRoute, {
            method: 'PUT',
            body: { token, password: 'aZ1-newpass!?' }
        });
        expect(res.status).toBe(200);
        isSuccess(json);

        // every session is forcibly logged out (the reset flow is anonymous, so none is spared)
        expect((await api.fetch(userRoute, { method: 'GET', session: sessionA })).res.status).toBe(401);
        expect((await api.fetch(userRoute, { method: 'GET', session: sessionB })).res.status).toBe(401);

        const recoveredSession = await signin(email, 'aZ1-newpass!?');
        // password recovery must not make an existing user eligible for new-user account discovery.
        expect((await api.fetch(accountDiscoveryRoute, { method: 'GET', session: recoveredSession })).res.status).toBe(404);
    });

    it('should require a second factor when the user has one enrolled', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);
        await enrollMfa(session);

        const token = await issueResetToken(email);

        // a mailbox alone must not be enough to take the account over
        const missing = await api.fetch(resetPasswordRoute, { method: 'PUT', body: { token, password: 'aZ1-newpass!?' } });
        expect(missing.res.status).toBe(400);
        isError(missing.json);
        expect(missing.json).toStrictEqual({ error: { code: 'mfa_code_required' } });

        const wrongCode = await api.fetch(resetPasswordRoute, {
            method: 'PUT',
            body: { token, password: 'aZ1-newpass!?', mfa: { type: 'code', code: '000000' } }
        });
        expect(wrongCode.res.status).toBe(400);
        isError(wrongCode.json);
        expect(wrongCode.json).toStrictEqual({ error: { code: 'invalid_mfa_code' } });

        // the old password still works, so nothing was changed by the rejected attempts
        await signin(email, password);
    });

    it('should reset the password with a valid code, and with a recovery code', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);
        const { totp, recoveryCodes } = await enrollMfa(session);

        const withCode = await api.fetch(resetPasswordRoute, {
            method: 'PUT',
            body: {
                token: await issueResetToken(email),
                password: 'aZ1-newpass!?',
                mfa: { type: 'code', code: totp.generate({ timestamp: Date.now() + 30_000 }) }
            }
        });
        expect(withCode.res.status).toBe(200);
        isSuccess(withCode.json);

        const withRecoveryCode = await api.fetch(resetPasswordRoute, {
            method: 'PUT',
            body: { token: await issueResetToken(email), password: 'aZ1-thirdpass!?', mfa: { type: 'recoveryCode', recoveryCode: recoveryCodes[0]! } }
        });
        expect(withRecoveryCode.res.status).toBe(200);
        isSuccess(withRecoveryCode.json);
    });

    it('should reject an invalid token before asking for a second factor', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);
        await enrollMfa(session);

        await issueResetToken(email);
        const { res, json } = await api.fetch(resetPasswordRoute, {
            method: 'PUT',
            body: { token: jwt.sign({ user: email }, 'not-the-reset-secret', { expiresIn: '10m' }), password: 'aZ1-newpass!?' }
        });
        expect(res.status).toBe(400);
        isError(json);
        expect(json).toStrictEqual({ error: { code: 'user_not_found' } });
    });

    it('should skip the second factor when the feature is off for the account', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);
        await enrollMfa(session);

        const token = await issueResetToken(email);
        mfaFlagSpy.mockResolvedValueOnce(false);
        const { res, json } = await api.fetch(resetPasswordRoute, { method: 'PUT', body: { token, password: 'aZ1-newpass!?' } });
        expect(res.status).toBe(200);
        isSuccess(json);
    });
});
