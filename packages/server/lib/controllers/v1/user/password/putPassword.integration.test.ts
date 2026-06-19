import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { isSuccess, runServer } from '../../../../utils/tests.js';

const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';
const passwordRoute = '/api/v1/user/password';
const userRoute = '/api/v1/user';

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

describe(`PUT ${passwordRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
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
});
