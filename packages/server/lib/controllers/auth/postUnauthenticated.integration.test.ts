import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isError, isSuccess, runServer } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/auth/unauthenticated/:providerConfigKey';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should create one connection with connection_id', async () => {
        const env = await seeders.createEnvironmentSeed();
        const config = await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { connection_id: 'a', public_key: env.public_key },
            params: { providerConfigKey: config.unique_key }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            connectionId: 'a',
            providerConfigKey: 'unauthenticated'
        });
    });

    it('should create one connection without connection_id', async () => {
        const env = await seeders.createEnvironmentSeed();
        const config = await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { public_key: env.public_key },
            params: { providerConfigKey: config.unique_key }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            connectionId: expect.any(String),
            providerConfigKey: 'unauthenticated'
        });
    });

    it('should create one connection with sessionToken', async () => {
        const env = await seeders.createEnvironmentSeed();
        const config = await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

        const resSession = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: env.secret_key,
            body: { end_user: { id: '1', email: 'john@example.com' } }
        });
        isSuccess(resSession.json);

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { connect_session_token: resSession.json.data.token },
            params: { providerConfigKey: config.unique_key }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            connectionId: expect.any(String),
            providerConfigKey: 'unauthenticated'
        });
    });

    it('should not be allowed to connect to an integration if disallowed by sessionToken', async () => {
        const env = await seeders.createEnvironmentSeed();
        const config = await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');
        await seeders.createConfigSeed(env, 'not_this_one', 'unauthenticated');

        const resSession = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: env.secret_key,
            body: { end_user: { id: '1', email: 'john@example.com' }, allowed_integrations: ['not_this_one'] }
        });
        isSuccess(resSession.json);

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { connect_session_token: resSession.json.data.token },
            params: { providerConfigKey: config.unique_key }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'integration_not_allowed' }
        });
    });

    it('should not be allowed to pass a connection_id with session token', async () => {
        const env = await seeders.createEnvironmentSeed();
        const config = await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

        const resSession = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: env.secret_key,
            body: { end_user: { id: '1', email: 'john@example.com' }, allowed_integrations: ['unauthenticated'] }
        });
        isSuccess(resSession.json);

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { connect_session_token: resSession.json.data.token, connection_id: 'my-connection-id' },
            params: { providerConfigKey: config.unique_key }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_query_params',
                errors: [{ code: 'custom', message: 'connection_id is forbidden when using session token', path: ['connection_id'] }]
            }
        });
    });
});
