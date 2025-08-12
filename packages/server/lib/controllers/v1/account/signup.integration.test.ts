import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { isSuccess, runServer } from '../../../utils/tests.js';

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
        const res = await api.fetch(route, { method: 'POST', body: {} as any });

        expect(res.res.status).toBe(400);
    });

    it('should validate body', async () => {
        const res = await api.fetch(route, { method: 'POST', body: {} as any });

        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['email'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['password'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['name'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['foundUs'] }
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
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                uuid: expect.any(String),
                verified: false
            }
        });
    });
});
