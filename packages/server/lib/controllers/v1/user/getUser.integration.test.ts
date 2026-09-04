import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ROLES } from '@nangohq/authz';
import { seeders, userService } from '@nangohq/shared';
import { flags } from '@nangohq/utils';

import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

const route = '/api/v1/user';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET' });

        shouldBeProtected(res);
    });

    it('should enforce no query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: apiKey.secret,
            // @ts-expect-error on purpose
            query: { env: 'dev' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_query_params',
                errors: [{ code: 'unrecognized_keys', message: 'Unrecognized key: "env"', path: [] }]
            }
        });
    });

    // The field name is part of the contract with the webapp.
    it('should send the grants the role carries', async () => {
        const originalFlag = flags.hasAuthRoles;
        flags.hasAuthRoles = true;
        try {
            const { user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
            const session = await authenticateUser(api, user);

            const res = await api.fetch(route, { method: 'GET', session });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data.grants).toEqual(ROLES[user.role]);
            expect(res.json.data).not.toHaveProperty('permissions');
        } finally {
            flags.hasAuthRoles = originalFlag;
        }
    });

    it('should send a demoted role its narrower grants', async () => {
        const originalFlag = flags.hasAuthRoles;
        flags.hasAuthRoles = true;
        try {
            const { account } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
            const member = await seeders.seedUser(account.id);
            await userService.update({ id: member.id, role: 'production_support' });
            const session = await authenticateUser(api, member);

            const res = await api.fetch(route, { method: 'GET', session });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data.grants).toEqual(ROLES.production_support);
        } finally {
            flags.hasAuthRoles = originalFlag;
        }
    });
});
