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
        envs.NANGO_IMPERSONATION_MFA_REQUIRED = true;
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
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
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

        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            // @ts-expect-error on purpose
            body: { accountUUID: 'test' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_format', message: 'Invalid UUID', path: ['accountUUID'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['loginReason'] }
                ]
            }
        });
    });

    it('should ensure we are allowed to impersonate', async () => {
        flags.hasAdminCapabilities = true;
        envs.NANGO_ADMIN_UUID = 'e1e8fee9-a459-46fe-9e82-15c93dae2406'; // will not match current account

        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            body: { accountUUID: 'f8ca4c4e-8c5a-4502-93f9-cd89d7551362', loginReason: 'test' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'forbidden', message: 'You are not authorized to impersonate an account' }
        });
    });

    it('should refuse a secret key, which has no session to challenge', async () => {
        flags.hasAdminCapabilities = true;

        const { account, apiKey } = await seeders.seedAccountEnvAndUser();
        envs.NANGO_ADMIN_UUID = account.uuid;

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            body: { accountUUID: 'f8ca4c4e-8c5a-4502-93f9-cd89d7551362', loginReason: 'test', code: '123456' }
        });

        isError(res.json);
        expect(res.res.status).toBe(401);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'forbidden', message: 'Impersonation requires a dashboard session' }
        });
    });

    it('should refuse a secret key under breakglass too', async () => {
        flags.hasAdminCapabilities = true;
        envs.NANGO_IMPERSONATION_MFA_REQUIRED = false;

        const { account, apiKey } = await seeders.seedAccountEnvAndUser();
        envs.NANGO_ADMIN_UUID = account.uuid;

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            body: { accountUUID: 'f8ca4c4e-8c5a-4502-93f9-cd89d7551362', loginReason: 'test' }
        });

        // Turning the challenge off must not also turn off the session requirement
        isError(res.json);
        expect(res.res.status).toBe(401);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'forbidden', message: 'Impersonation requires a dashboard session' }
        });
    });

    it('should reject a malformed code', async () => {
        flags.hasAdminCapabilities = true;

        const { account, apiKey } = await seeders.seedAccountEnvAndUser();
        envs.NANGO_ADMIN_UUID = account.uuid;

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            body: { accountUUID: 'f8ca4c4e-8c5a-4502-93f9-cd89d7551362', loginReason: 'test', code: 'abc' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_format', message: 'Invalid string: must match pattern /^\\d{6}$/', path: ['code'] }]
            }
        });
    });

    // TODO: Need a success test, the breakglass skip, and the per-user challenge cases (no factor,
    // wrong code, attempt cap) but they all need a dashboard session, which this setup cannot create.
});
