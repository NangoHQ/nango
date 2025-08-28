import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { linkConnection, seeders } from '@nangohq/shared';

import { getConnectSessionByToken } from '../../services/connectSession.service.js';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { DBConnection, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

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
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['connection_id'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['integration_id'] }
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

    describe('docs connect url override validation', () => {
        let seed: { account: DBTeam; env: DBEnvironment; user: DBUser; plan: DBPlan };
        let connection: DBConnection;
        beforeEach(async () => {
            seed = await seeders.seedAccountEnvAndUser();
            const endUser = await seeders.createEndUser({ environment: seed.env, account: seed.account });

            // Create an initial connection
            await seeders.createConfigSeed(seed.env, 'github', 'github');
            connection = await seeders.createConnectionSeed({ env: seed.env, provider: 'github' });
            await linkConnection(db.knex, { endUserId: endUser.id, connection });
        });

        it('should allow docs connect url override when plan has can_override_docs_connect_url enabled', async () => {
            // Update the plan to enable the feature flag
            await db.knex('plans').where('id', seed.plan.id).update({ can_override_docs_connect_url: true });

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    connection_id: connection.connection_id,
                    integration_id: 'github',
                    overrides: {
                        github: {
                            docs_connect: 'https://custom-docs.example.com'
                        }
                    }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual<typeof res.json>({
                data: {
                    expires_at: expect.toBeIsoDate(),
                    token: expect.any(String)
                }
            });
        });

        it('should reject docs connect url override when plan has can_override_docs_connect_url disabled', async () => {
            // Ensure the plan has the feature flag disabled
            await db.knex('plans').where('id', seed.plan.id).update({ can_override_docs_connect_url: false });

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    connection_id: connection.connection_id,
                    integration_id: 'github',
                    overrides: {
                        github: {
                            docs_connect: 'https://custom-docs.example.com'
                        }
                    }
                }
            });

            isError(res.json);
            expect(res.json).toStrictEqual<typeof res.json>({
                error: {
                    code: 'forbidden',
                    message: 'You are not allowed to override the docs connect url'
                }
            });
            expect(res.res.status).toBe(403);
        });

        it('should allow request when overrides exist but no docs_connect override is present', async () => {
            // Ensure the plan has the feature flag disabled
            await db.knex('plans').where('id', seed.plan.id).update({ can_override_docs_connect_url: false });

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    connection_id: connection.connection_id,
                    integration_id: 'github',
                    overrides: {
                        github: {
                            // No docs_connect override
                        }
                    }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual<typeof res.json>({
                data: {
                    expires_at: expect.toBeIsoDate(),
                    token: expect.any(String)
                }
            });
        });

        it('should allow request when overrides exist but docs_connect is undefined', async () => {
            // Ensure the plan has the feature flag disabled
            await db.knex('plans').where('id', seed.plan.id).update({ can_override_docs_connect_url: false });

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    connection_id: connection.connection_id,
                    integration_id: 'github',
                    overrides: {
                        github: {
                            docs_connect: undefined
                        }
                    }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual<typeof res.json>({
                data: {
                    expires_at: expect.toBeIsoDate(),
                    token: expect.any(String)
                }
            });
        });
    });
});
