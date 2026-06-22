import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { sendResetPasswordEmail } from '../../../helpers/email.js';
import { isSuccess, runServer } from '../../../utils/tests.js';

import type * as emailHelpers from '../../../helpers/email.js';

vi.mock('../../../helpers/email.js', async (importActual) => ({
    ...(await importActual<typeof emailHelpers>()),
    sendResetPasswordEmail: vi.fn(() => Promise.resolve())
}));

const signupRoute = '/api/v1/account/signup';
const forgotPasswordRoute = '/api/v1/account/forgot-password';

let api: Awaited<ReturnType<typeof runServer>>;

async function signupVerifiedUser(): Promise<string> {
    const email = `${nanoid()}@example.com`;
    const password = 'aZ1-foobar!?';

    const signupRes = await api.fetch(signupRoute, {
        method: 'POST',
        body: { email, name: 'Foobar', password, foundUs: 'tests' } as any
    });
    expect(signupRes.res.status).toBe(200);

    const createdUser = await userService.getUserByEmail(email);
    await userService.verifyUserEmail(createdUser!.id);

    return email;
}

describe(`POST ${forgotPasswordRoute}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    afterEach(() => {
        vi.mocked(sendResetPasswordEmail).mockReset();
        vi.mocked(sendResetPasswordEmail).mockResolvedValue(undefined);
    });

    it('should respond identically whether or not the email matches an account (no user enumeration)', async () => {
        const existingEmail = await signupVerifiedUser();
        const unknownEmail = `${nanoid()}@example.com`;

        const existing = await api.fetch(forgotPasswordRoute, { method: 'POST', body: { email: existingEmail } });
        const unknown = await api.fetch(forgotPasswordRoute, { method: 'POST', body: { email: unknownEmail } });

        expect(existing.res.status).toBe(200);
        expect(unknown.res.status).toBe(200);
        isSuccess(existing.json);
        isSuccess(unknown.json);
        expect(unknown.json).toEqual(existing.json);
    });

    it('should still respond with success when the reset flow fails internally (no user enumeration via errors)', async () => {
        const existingEmail = await signupVerifiedUser();
        vi.mocked(sendResetPasswordEmail).mockRejectedValueOnce(new Error('email provider down'));

        const { res, json } = await api.fetch(forgotPasswordRoute, { method: 'POST', body: { email: existingEmail } });

        expect(res.status).toBe(200);
        isSuccess(json);
    });
});
