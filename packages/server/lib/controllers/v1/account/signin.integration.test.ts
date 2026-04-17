import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { isError, isSuccess, runServer } from '../../../utils/tests.js';

const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';

let api: Awaited<ReturnType<typeof runServer>>;

async function signupUser({ emailVerified }: { emailVerified: boolean }): Promise<{ email: string; password: string }> {
    const email = `${nanoid()}@example.com`;
    const password = 'aZ1-foobar!';

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

describe(`POST ${signinRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
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
});
