import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { accountService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { runServer } from '../../../../utils/tests.js';

const signupRoute = '/api/v1/account/signup';
const verifyEmailRoute = '/api/v1/account/verify/code';
const accountDiscoveryRoute = '/api/v1/account/onboarding/account-discovery';

let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${accountDiscoveryRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('suggests an eligible same-domain account after password-signup email verification', async () => {
        const domain = `${nanoid()}.example.com`;
        const existingAccount = await accountService.createAccount({ name: 'Existing account', email: `admin@${domain}` });
        expect(existingAccount).not.toBeNull();
        const existingAdmin = await userService.createUser({
            email: `admin@${domain}`,
            name: 'Existing administrator',
            account_id: existingAccount!.id,
            email_verified: true,
            role: 'administrator'
        });
        expect(existingAdmin).not.toBeNull();

        const email = `new-user@${domain}`;
        const signupRes = await api.fetch(signupRoute, {
            method: 'POST',
            body: { email, name: 'New user', password: 'aZ1-foobar!?', foundUs: 'tests' }
        });
        expect(signupRes.res.status).toBe(200);

        const newUser = await userService.getUserByEmail(email);
        expect(newUser?.email_verification_token).toBeTruthy();

        const verificationRes = await api.fetch(
            verifyEmailRoute as any,
            {
                method: 'POST',
                body: { token: newUser!.email_verification_token! }
            } as any
        );
        expect(verificationRes.res.status).toBe(200);
        const session = verificationRes.res.headers.getSetCookie()[0]?.split(';')[0];
        expect(session).toBeTruthy();

        const discoveryRes = await api.fetch(accountDiscoveryRoute, { method: 'GET', session: session! });

        expect(discoveryRes.res.status).toBe(200);
        expect(discoveryRes.json).toStrictEqual({
            data: {
                suggestedAccountName: existingAccount!.name
            }
        });
    });
});
