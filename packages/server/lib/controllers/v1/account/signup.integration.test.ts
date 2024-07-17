import { migrateLogsMapping } from '@nangohq/logs';
import { multipleMigrations } from '@nangohq/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSuccess, runServer } from '../../../utils/tests.js';
import { nanoid } from '@nangohq/utils';

const route = '/api/v1/account/signup';
let api: Awaited<ReturnType<typeof runServer>>;
describe('POST /api/v1/account/signup', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateLogsMapping();

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
                    { code: 'invalid_type', message: 'Required', path: ['email'] },
                    { code: 'invalid_type', message: 'Required', path: ['password'] },
                    { code: 'invalid_type', message: 'Required', path: ['name'] }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should enforce password strength', async () => {
        const res = await api.fetch(route, { method: 'POST', body: { email: 'a@example.com', name: 'Foobar', password: '12345678' } });

        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'custom',
                        message: 'Password should be least 8 characters with lowercase, uppercase, a number and a special character',
                        path: ['password']
                    }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should signup', async () => {
        const res = await api.fetch(route, { method: 'POST', body: { email: `${nanoid()}@example.com`, name: 'Foobar', password: 'aZ1-foobar!' } });

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
