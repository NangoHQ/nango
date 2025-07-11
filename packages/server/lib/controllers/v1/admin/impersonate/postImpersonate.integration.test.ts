import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';
import { flags } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { isError, runServer, shouldBeProtected } from '../../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/admin/impersonate';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        flags.hasAdminCapabilities = false;
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            body: { accountUUID: 'test', loginReason: 'test' }
        });

        shouldBeProtected(res);
    });

    it('should block if admin capabilities are not enabled', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: env.secret_key,
            body: { accountUUID: 'test', loginReason: 'test' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'feature_disabled',
                message: 'Admin capabilities are not enabled'
            }
        });
    });

    it('should validate body', async () => {
        flags.hasAdminCapabilities = true;
        envs.NANGO_ADMIN_UUID = 'e1e8fee9-a459-46fe-9e82-15c93dae2406';

        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { accountUUID: 'test' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_string', message: 'Invalid uuid', path: ['accountUUID'] },
                    { code: 'invalid_type', message: 'Required', path: ['loginReason'] }
                ]
            }
        });
    });

    it('should ensure we are allowed to impersonate', async () => {
        flags.hasAdminCapabilities = true;
        envs.NANGO_ADMIN_UUID = 'e1e8fee9-a459-46fe-9e82-15c93dae2406'; // will not match current account

        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: env.secret_key,
            body: { accountUUID: 'f8ca4c4e-8c5a-4502-93f9-cd89d7551362', loginReason: 'test' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'forbidden', message: 'You are not authorized to impersonate an account' }
        });
    });

    // TODO: Need an actual success test but can't work because we don't have a session with current test setup
});
