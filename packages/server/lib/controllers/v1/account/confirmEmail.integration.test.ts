import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { runServer } from '../../../utils/tests.js';

const confirmEmailRoute = '/api/v1/account/verify/code';
const signinRoute = '/api/v1/account/signin';

let api: Awaited<ReturnType<typeof runServer>>;

async function signupUser() {
    const email = `${nanoid().toLowerCase()}@example.com`;
    const password = 'aZ1-foobar!?';
    const signupRes = await api.fetch('/api/v1/account/signup', {
        method: 'POST',
        body: { email, name: 'Foobar', password, foundUs: 'tests' }
    });

    expect(signupRes.res.status).toBe(200);

    const user = await userService.getUserByEmail(email);
    expect(user).toBeTruthy();
    expect(user!.email_verification_token).toBeTruthy();

    return { email, password, user: user! };
}

describe(`POST ${confirmEmailRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('verifies the email without creating a session', async () => {
        const { email, password, user } = await signupUser();

        const { res, json } = await api.fetch(confirmEmailRoute, {
            method: 'POST',
            body: { token: user.email_verification_token! }
        });

        expect(res.status).toBe(200);
        expect(res.headers.getSetCookie()).toHaveLength(0);
        expect(json).toMatchObject({ email, userId: user.id, accountId: user.account_id });

        const verifiedUser = await userService.getUserById(user.id, true);
        expect(verifiedUser?.email_verified).toBe(true);
        expect(verifiedUser?.email_verification_token).toBeNull();

        const signinRes = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
        expect(signinRes.res.status).toBe(200);
        expect(signinRes.res.headers.getSetCookie()[0]).toMatch(/^nango_session=/);
    });

    it('does not verify an expired token', async () => {
        const { user } = await signupUser();
        const expiredToken = user.email_verification_token!;
        await userService.update({ id: user.id, email_verification_token_expires_at: new Date(Date.now() - 1_000) });

        const { res, json } = await api.fetch(confirmEmailRoute, {
            method: 'POST',
            body: { token: expiredToken }
        });

        expect(res.status).toBe(400);
        expect(json).toMatchObject({ error: { code: 'token_expired' } });

        const unverifiedUser = await userService.getUserById(user.id, true);
        expect(unverifiedUser?.email_verified).toBe(false);
        expect(unverifiedUser?.email_verification_token).toBe(expiredToken);
        expect(unverifiedUser?.email_verification_token_expires_at?.getTime()).toBeLessThan(Date.now());
    });

    it('does not verify an invalid token', async () => {
        const { user } = await signupUser();

        const { res, json } = await api.fetch(confirmEmailRoute, {
            method: 'POST',
            body: { token: 'invalid-token' }
        });

        expect(res.status).toBe(400);
        expect(json).toMatchObject({ error: { code: 'invalid_token' } });

        const unverifiedUser = await userService.getUserById(user.id, true);
        expect(unverifiedUser?.email_verified).toBe(false);
    });
});
