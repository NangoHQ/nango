import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { accountService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { sendAccountInvitationRequestEmail } from '../../../../helpers/email.js';
import { runServer } from '../../../../utils/tests.js';

import type * as emailHelpers from '../../../../helpers/email.js';

vi.mock('../../../../helpers/email.js', async (importActual) => ({
    ...(await importActual<typeof emailHelpers>()),
    sendAccountInvitationRequestEmail: vi.fn(() => Promise.resolve())
}));

const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';
const accountDiscoveryRoute = '/api/v1/account/onboarding/account-discovery';
const requestInviteRoute = '/api/v1/account/onboarding/request-invite';

let api: Awaited<ReturnType<typeof runServer>>;

async function createSuggestedAccountSession() {
    const domain = `${nanoid()}.example.com`;
    const suggestedAccount = await accountService.createAccount({ name: 'Suggested account', email: `admin@${domain}` });
    expect(suggestedAccount).not.toBeNull();

    const administrator = await userService.createUser({
        email: `admin@${domain}`,
        name: 'Existing administrator',
        account_id: suggestedAccount!.id,
        email_verified: true,
        role: 'administrator'
    });
    expect(administrator).not.toBeNull();

    const email = `new-user@${domain}`;
    const signupRes = await api.fetch(signupRoute, {
        method: 'POST',
        body: { email, name: 'New user', password: 'aZ1-foobar!?', foundUs: 'tests' }
    });
    expect(signupRes.res.status).toBe(200);

    const requester = await userService.getUserByEmail(email);
    expect(requester).toBeTruthy();
    await userService.verifyUserEmail(requester!.id, { markAccountDiscoveryPending: true });

    const signinRes = await api.fetch(signinRoute, { method: 'POST', body: { email, password: 'aZ1-foobar!?' } });
    expect(signinRes.res.status).toBe(200);
    expect(signinRes.json).toMatchObject({ url: '/onboarding/account-discovery' });
    const session = signinRes.res.headers.getSetCookie()[0]?.split(';')[0];
    expect(session).toBeTruthy();

    const discoveryRes = await api.fetch(accountDiscoveryRoute, { method: 'GET', session: session! });
    expect(discoveryRes.res.status).toBe(200);

    return { administrator: administrator!, requester: (await userService.getUserByEmail(email))!, session: session!, suggestedAccount: suggestedAccount! };
}

describe(`POST ${requestInviteRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    afterEach(() => {
        vi.mocked(sendAccountInvitationRequestEmail).mockReset();
        vi.mocked(sendAccountInvitationRequestEmail).mockResolvedValue(undefined);
    });

    it('emails verified active administrators once and permanently consumes the request', async () => {
        const { administrator, requester, session, suggestedAccount } = await createSuggestedAccountSession();

        const first = await api.fetch(requestInviteRoute, { method: 'POST', session });
        const second = await api.fetch(requestInviteRoute, { method: 'POST', session });

        expect(first.res.status).toBe(200);
        expect(second.res.status).toBe(404);
        expect(sendAccountInvitationRequestEmail).toHaveBeenCalledTimes(1);
        expect(sendAccountInvitationRequestEmail).toHaveBeenCalledWith({
            email: administrator.email,
            account: expect.objectContaining({ id: suggestedAccount.id, name: suggestedAccount.name }),
            requester: expect.objectContaining({ id: requester.id, name: requester.name, email: requester.email })
        });

        const updatedRequester = await userService.getUserById(requester.id);
        expect(updatedRequester?.account_invitation_requested_at).not.toBeNull();
    });

    it('allows a retry when all invitation request emails fail', async () => {
        const { requester, session } = await createSuggestedAccountSession();
        vi.mocked(sendAccountInvitationRequestEmail).mockRejectedValueOnce(new Error('email provider down'));

        const failed = await api.fetch(requestInviteRoute, { method: 'POST', session });

        expect(failed.res.status).toBe(503);
        expect(failed.json).toEqual({ error: { code: 'email_delivery_failed' } });
        // Session marker should not be set when mail delivery fails completely.
        expect((await userService.getUserById(requester.id))?.account_invitation_requested_at).toBeNull();

        const retry = await api.fetch(requestInviteRoute, { method: 'POST', session });
        expect(retry.res.status).toBe(200);

        const duplicate = await api.fetch(requestInviteRoute, { method: 'POST', session });
        expect(duplicate.res.status).toBe(404);

        expect(sendAccountInvitationRequestEmail).toHaveBeenCalledTimes(2);
        expect((await userService.getUserById(requester.id))?.account_invitation_requested_at).not.toBeNull();
    });
});
