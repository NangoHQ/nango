import db, { multipleMigrations } from '@nangohq/database';
import { inviteEmail, seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

const route = '/api/v1/team/invite';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`DELETE ${route}`, () => {
    beforeAll(async () => {
        await multipleMigrations();
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'DELETE', query: { env: 'dev' }, body: { email: '' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            body: { email: '' },
            // @ts-expect-error missing query on purpose
            query: {}
        });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev' },
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { email: 1 }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Expected string, received number', path: ['email'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should revoke an invite', async () => {
        const { env, account, user } = await seeders.seedAccountEnvAndUser();

        const email = 'foo@example.com';
        await inviteEmail({ email, name: email, accountId: account.id, invitedByUserId: user.id, trx: db.knex });

        const listBefore = await api.fetch('/api/v1/team', { method: 'GET', query: { env: 'dev' }, token: env.secret_key });
        isSuccess(listBefore.json);
        expect(listBefore.json.data.invitedUsers).toHaveLength(1);

        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { email: email }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: { success: true }
        });

        const listAfter = await api.fetch('/api/v1/team', { method: 'GET', query: { env: 'dev' }, token: env.secret_key });
        isSuccess(listAfter.json);
        expect(listAfter.json.data.invitedUsers).toHaveLength(0);
    });
});
