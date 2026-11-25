import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { connectionService, seeders } from '@nangohq/shared';

import { isSuccess, runServer } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api-auth/api-key/:providerConfigKey';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should keep the stored metadata on reconnect', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'anrok', 'anrok');

        const resSession = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: apiKey.secret,
            body: { end_user: { id: '1', email: 'john@example.com' }, allowed_integrations: ['anrok'] }
        });
        isSuccess(resSession.json);

        const resConnect = await api.fetch(endpoint, {
            method: 'POST',
            query: { connect_session_token: resSession.json.data.token },
            params: { providerConfigKey: config.unique_key },
            body: { apiKey: 'first' }
        });
        isSuccess(resConnect.json);

        await db
            .knex('_nango_connections')
            .where({ connection_id: resConnect.json.connectionId, environment_id: env.id })
            .update({ metadata: { customer: 'acme' } });

        const resSessionReconnect = await api.fetch('/connect/sessions/reconnect', {
            method: 'POST',
            token: apiKey.secret,
            body: { connection_id: resConnect.json.connectionId, integration_id: resConnect.json.providerConfigKey }
        });
        isSuccess(resSessionReconnect.json);

        const resReconnect = await api.fetch(endpoint, {
            method: 'POST',
            query: { connect_session_token: resSessionReconnect.json.data.token },
            params: { providerConfigKey: config.unique_key },
            body: { apiKey: 'second' }
        });
        isSuccess(resReconnect.json);
        expect(resReconnect.json.connectionId).toBe(resConnect.json.connectionId);

        const connection = await connectionService.checkIfConnectionExists(db.knex, {
            connectionId: resConnect.json.connectionId,
            providerConfigKey: resConnect.json.providerConfigKey,
            environmentId: env.id
        });
        expect(connection?.metadata).toStrictEqual({ customer: 'acme' });
    });
});
