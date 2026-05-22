import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { isSuccess, runServer } from '../../../utils/tests.js';

const route = '/api/v1/account/forgot-password';

let api: Awaited<ReturnType<typeof runServer>>;

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should find a mixed-case stored email with lowercase input', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const inputEmail = `casing-${nanoid()}@example.com`;
        const mixedCaseEmail = `Casing-${inputEmail.slice('casing-'.length)}`;

        await db.knex('_nango_users').where({ id: user.id }).update({ email: mixedCaseEmail });

        const res = await api.fetch(route, {
            method: 'POST',
            body: { email: inputEmail }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual({ success: true });

        const updatedUser = await userService.getUserByEmail(inputEmail);
        expect(updatedUser?.reset_password_token).toBeTruthy();
    });
});
