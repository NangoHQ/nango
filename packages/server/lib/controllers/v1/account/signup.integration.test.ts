import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { isError, isSuccess, runServer } from '../../../utils/tests.js';

const route = '/api/v1/account/signup';
let api: Awaited<ReturnType<typeof runServer>>;
describe('POST /api/v1/account/signup', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should not be protected', async () => {
        const res = await api.fetch(route, {
            method: 'POST',
            // @ts-expect-error invalid body on purpose
            body: {}
        });

        expect(res.res.status).toBe(400);
    });

    it('should validate body', async () => {
        const res = await api.fetch(route, {
            method: 'POST',
            // @ts-expect-error invalid body on purpose
            body: {}
        });

        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['email'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['password'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['name'] }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should enforce password strength', async () => {
        const res = await api.fetch(route, { method: 'POST', body: { email: 'a@example.com', name: 'Foobar', password: '12345678', foundUs: '' } });

        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'custom',
                        message: 'Password should be least 8 characters with uppercase, a number and a special character',
                        path: ['password']
                    }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should signup', async () => {
        const res = await api.fetch(route, {
            method: 'POST',
            body: { email: `${nanoid()}@example.com`, name: 'Foobar', password: 'aZ1-foobar!', foundUs: 'the internet' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.verified).toBe(false);
        expect(typeof res.json.data.uuid).toBe('string');
    });

    it('should treat existing user emails case-insensitively', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const inputEmail = `casing-${nanoid()}@example.com`;
        const mixedCaseEmail = `Casing-${inputEmail.slice('casing-'.length)}`;

        await db.knex('_nango_users').where({ id: user.id }).update({ email: mixedCaseEmail });

        const res = await api.fetch(route, {
            method: 'POST',
            body: { email: inputEmail, name: 'Foobar', password: 'aZ1-foobar!', foundUs: 'the internet' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('user_already_exists');
    });
});
