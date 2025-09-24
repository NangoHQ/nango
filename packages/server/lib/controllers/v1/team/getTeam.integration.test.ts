import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

const route = '/api/v1/team';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { token: env.secret_key, params: { operationId: '1' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should get team', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                invitedUsers: [],
                isAdminTeam: false,
                account: {
                    id: account.id,
                    name: account.name,
                    created_at: expect.toBeIsoDate(),
                    updated_at: expect.toBeIsoDate(),
                    uuid: account.uuid,
                    found_us: null
                },
                users: [
                    {
                        accountId: account.id,
                        email: user.email,
                        id: user.id,
                        name: user.name,
                        uuid: user.uuid,
                        gettingStartedClosed: user.getting_started_closed
                    }
                ]
            }
        });
    });
});
