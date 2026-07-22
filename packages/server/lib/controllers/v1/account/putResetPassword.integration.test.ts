import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { isSuccess, runServer } from '../../../utils/tests.js';
import { resetPasswordSecret } from '../../../utils/utils.js';

const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';
const resetPasswordRoute = '/api/v1/account/reset-password';
const userRoute = '/api/v1/user';
const accountDiscoveryRoute = '/api/v1/account/onboarding/account-discovery';

let api: Awaited<ReturnType<typeof runServer>>;

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

describe(`PUT ${resetPasswordRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
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
});
