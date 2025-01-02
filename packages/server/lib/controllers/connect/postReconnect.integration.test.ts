import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { runServer, shouldBeProtected, isError, isSuccess } from '../../utils/tests.js';
import { linkConnection, seeders } from '@nangohq/shared';
import db from '@nangohq/database';
import { getConnectSessionByToken } from '../../services/connectSession.service.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connect/sessions/reconnect';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error on purpose
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should fail if no connection_id or integration_id', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: {}
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Required', path: ['connection_id'] },
                    { code: 'invalid_type', message: 'Required', path: ['integration_id'] }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should get a session token', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();

        const endUser = await seeders.createEndUser({ environment: env, account });

        // Create an initial connection
        await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });
        await linkConnection(db.knex, { endUserId: endUser.id, connection });

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                connection_id: connection.connection_id,
                integration_id: 'github'
            }
        });
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                expires_at: expect.toBeIsoDate(),
                token: expect.any(String)
            }
        });

        // Make sure the session contains the connectionId
        const session = (await getConnectSessionByToken(db.knex, res.json.data.token)).unwrap();
        expect(session.connectSession.connectionId).toBe(connection.id);
    });

    it('should fail if the connection was not created with a session token', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        // Create an initial connection
        await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                connection_id: connection.connection_id,
                integration_id: 'github'
            }
        });
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                message: "Can't update a connection that was not created with a session token"
            }
        });
    });

    it('should fail if integration_id does not exist in allowed_integrations', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        // Create an initial connection
        await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: { connection_id: connection.connection_id, integration_id: 'random' }
        });
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                message: 'ConnectionID or IntegrationId does not exists'
            }
        });
    });
});
