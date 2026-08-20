import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { isError, isSuccess, runServer } from '../../../../utils/tests.js';

import type { MockInstance } from 'vitest';

const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';
const passwordRoute = '/api/v1/user/password';
const userRoute = '/api/v1/user';
const mfaRoute = '/api/v1/account/mfa';
const STEP_MS = 30 * 1000;

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

describe(`PUT ${passwordRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
        mfaFlagSpy = vi.spyOn(featureFlags.getFlags(), 'isMFAEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    it('should reject an incorrect current password', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);

        const { res, json } = await api.fetch(passwordRoute, {
            method: 'PUT',
            session,
            body: { oldPassword: 'aZ1-wrongpass!?', newPassword: 'aZ1-newpass!?' }
        });

        expect(res.status).toBe(400);
        isError(json);
        expect(json).toStrictEqual({ error: { code: 'incorrect_password' } });
    });

    it('should rotate the current session and invalidate all others after a password change', async () => {
        const { email, password } = await signupVerifiedUser();

        const currentSession = await signin(email, password);
        const otherSession = await signin(email, password);

        // sanity: both sessions are valid before the change
        expect((await api.fetch(userRoute, { method: 'GET', session: currentSession })).res.status).toBe(200);
        expect((await api.fetch(userRoute, { method: 'GET', session: otherSession })).res.status).toBe(200);

        const { res, json } = await api.fetch(passwordRoute, {
            method: 'PUT',
            session: currentSession,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?' }
        });
        expect(res.status).toBe(200);
        isSuccess(json);

        // the change rotates the current session: a fresh cookie is issued and it differs from the old one
        const rotatedCookie = res.headers.getSetCookie()[0];
        expect(rotatedCookie).toMatch(/^nango_session=/);
        const rotatedSession = rotatedCookie!.split(';')[0]!;
        expect(rotatedSession).not.toBe(currentSession);

        // the old cookie (e.g. a stolen one) is now dead, even though it initiated the change
        expect((await api.fetch(userRoute, { method: 'GET', session: currentSession })).res.status).toBe(401);

        // the other session is forcibly logged out
        expect((await api.fetch(userRoute, { method: 'GET', session: otherSession })).res.status).toBe(401);

        // the user who made the change stays authenticated via the rotated session
        expect((await api.fetch(userRoute, { method: 'GET', session: rotatedSession })).res.status).toBe(200);
    });

    it('should require a second factor once the user has one enrolled', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);
        await enrollMfa(session);

        const missing = await api.fetch(passwordRoute, {
            method: 'PUT',
            session,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?' }
        });
        expect(missing.res.status).toBe(400);
        isError(missing.json);
        expect(missing.json).toStrictEqual({ error: { code: 'mfa_code_required' } });

        const wrongCode = await api.fetch(passwordRoute, {
            method: 'PUT',
            session,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?', mfa: { type: 'code', code: '000000' } }
        });
        expect(wrongCode.res.status).toBe(400);
        isError(wrongCode.json);
        expect(wrongCode.json).toStrictEqual({ error: { code: 'invalid_mfa_code' } });
    });

    it('should accept a valid code, and a recovery code, from a user with MFA enrolled', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);
        const { totp, recoveryCodes } = await enrollMfa(session);

        const withCode = await api.fetch(passwordRoute, {
            method: 'PUT',
            session,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?', mfa: { type: 'code', code: totp.generate({ timestamp: Date.now() + STEP_MS }) } }
        });
        expect(withCode.res.status).toBe(200);
        isSuccess(withCode.json);

        // the change killed every session, so sign in again with the new password. Use a recovery
        // code to get past the login challenge, since consecutive TOTP steps would depend on the
        // accepted window size.
        const nextSession = await signin(email, 'aZ1-newpass!?');
        const mfaLogin = await api.fetch(`${mfaRoute}/login/verify`, {
            method: 'POST',
            session: nextSession,
            body: { type: 'recoveryCode', recoveryCode: recoveryCodes[1]! }
        });
        expect(mfaLogin.res.status).toBe(200);
        const verifiedSession = mfaLogin.res.headers.getSetCookie()[0]!.split(';')[0]!;

        const withRecoveryCode = await api.fetch(passwordRoute, {
            method: 'PUT',
            session: verifiedSession,
            body: { oldPassword: 'aZ1-newpass!?', newPassword: 'aZ1-thirdpass!?', mfa: { type: 'recoveryCode', recoveryCode: recoveryCodes[0]! } }
        });
        expect(withRecoveryCode.res.status).toBe(200);
        isSuccess(withRecoveryCode.json);
    });

    it('should not consume the code when the current password is wrong', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);
        const { totp } = await enrollMfa(session);

        const code = totp.generate({ timestamp: Date.now() + STEP_MS });

        const wrongPassword = await api.fetch(passwordRoute, {
            method: 'PUT',
            session,
            body: { oldPassword: 'aZ1-wrongpass!?', newPassword: 'aZ1-newpass!?', mfa: { type: 'code', code } }
        });
        expect(wrongPassword.res.status).toBe(400);
        isError(wrongPassword.json);
        expect(wrongPassword.json).toStrictEqual({ error: { code: 'incorrect_password' } });

        // the same code still works, so the failed attempt did not burn it
        const retry = await api.fetch(passwordRoute, {
            method: 'PUT',
            session,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?', mfa: { type: 'code', code } }
        });
        expect(retry.res.status).toBe(200);
        isSuccess(retry.json);
    });

    it('should not spend a recovery code when the change itself fails', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);
        const { recoveryCodes } = await enrollMfa(session);

        vi.spyOn(userService, 'update').mockRejectedValueOnce(new Error('write failed'));
        const failed = await api.fetch(passwordRoute, {
            method: 'PUT',
            session,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?', mfa: { type: 'recoveryCode', recoveryCode: recoveryCodes[0]! } }
        });
        expect(failed.res.status).toBe(500);

        // the password did not change, so the code it consumed has to be spendable again
        const retry = await api.fetch(passwordRoute, {
            method: 'PUT',
            session,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?', mfa: { type: 'recoveryCode', recoveryCode: recoveryCodes[0]! } }
        });
        expect(retry.res.status).toBe(200);
        isSuccess(retry.json);
    });

    it('should accept the factor presented at login when the change follows straight after', async () => {
        const { email, password } = await signupVerifiedUser();
        const enrollSession = await signin(email, password);
        const { recoveryCodes } = await enrollMfa(enrollSession);

        // Sign in again now that a factor is enrolled, so this session goes through the MFA challenge
        // and carries the verification. A recovery code avoids depending on the TOTP window here.
        const pending = await signin(email, password);
        const mfaLogin = await api.fetch(`${mfaRoute}/login/verify`, {
            method: 'POST',
            session: pending,
            body: { type: 'recoveryCode', recoveryCode: recoveryCodes[0]! }
        });
        expect(mfaLogin.res.status).toBe(200);
        const verifiedSession = mfaLogin.res.headers.getSetCookie()[0]!.split(';')[0]!;

        const { res, json } = await api.fetch(passwordRoute, {
            method: 'PUT',
            session: verifiedSession,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?' }
        });
        expect(res.status).toBe(200);
        isSuccess(json);
    });

    it('should still reject a wrong code inside the post-login window', async () => {
        const { email, password } = await signupVerifiedUser();
        const enrollSession = await signin(email, password);
        const { recoveryCodes } = await enrollMfa(enrollSession);

        const pending = await signin(email, password);
        const mfaLogin = await api.fetch(`${mfaRoute}/login/verify`, {
            method: 'POST',
            session: pending,
            body: { type: 'recoveryCode', recoveryCode: recoveryCodes[0]! }
        });
        expect(mfaLogin.res.status).toBe(200);
        const verifiedSession = mfaLogin.res.headers.getSetCookie()[0]!.split(';')[0]!;

        // The window only stands in for a credential that was not sent. One that is sent still decides.
        const { res, json } = await api.fetch(passwordRoute, {
            method: 'PUT',
            session: verifiedSession,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?', mfa: { type: 'code', code: '000000' } }
        });
        expect(res.status).toBe(400);
        isError(json);
        expect(json).toStrictEqual({ error: { code: 'invalid_mfa_code' } });
    });

    it('should skip the second factor when the feature is off for the account', async () => {
        const { email, password } = await signupVerifiedUser();
        const session = await signin(email, password);
        await enrollMfa(session);

        mfaFlagSpy.mockResolvedValue(false);
        const { res, json } = await api.fetch(passwordRoute, {
            method: 'PUT',
            session,
            body: { oldPassword: password, newPassword: 'aZ1-newpass!?' }
        });
        mfaFlagSpy.mockResolvedValue(true);

        expect(res.status).toBe(200);
        isSuccess(json);
    });
});
