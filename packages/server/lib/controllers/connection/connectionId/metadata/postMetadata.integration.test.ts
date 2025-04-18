import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectionService, seeders } from '@nangohq/shared';

import { runServer, shouldBeProtected } from '../../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connection/metadata';

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
            body: {
                connection_id: '1',
                provider_config_key: 'test',
                metadata: {}
            }
        });

        shouldBeProtected(res);
    });

    it('should validate body with an empty connection_id', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                connection_id: '',
                provider_config_key: 'test',
                metadata: {}
            }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'invalid_string',
                        message: 'Invalid',
                        path: ['connection_id']
                    }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should validate body with an empty provider config key', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                connection_id: 'abc',
                provider_config_key: '',
                metadata: {}
            }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'invalid_string',
                        message: 'Invalid',
                        path: ['provider_config_key']
                    }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should provide an unknown connection response if a bad connection is provided', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const connection_id = 'abc';
        const provider_config_key = 'test';

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                connection_id,
                provider_config_key,
                metadata: {}
            }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'unknown_connection',
                message: `Connection with connection id ${connection_id} and provider config key ${provider_config_key} not found. Please make sure the connection exists in the Nango dashboard`
            }
        });
        expect(res.res.status).toBe(404);
    });

    it('should provide an unknown connection response if bad connections are provided', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const connection_id = ['abc', 'def'];
        const provider_config_key = 'test';

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                connection_id,
                provider_config_key,
                metadata: {}
            }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'unknown_connection',
                message: `Connection with connection id ${connection_id[0]} and provider config key ${provider_config_key} not found. Please make sure the connection exists in the Nango dashboard. No actions were taken on any of the connections as a result of this failure.`
            }
        });
        expect(res.res.status).toBe(404);
    });

    it('Should replace existing metadata, overwriting anything existing', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'test-replace', 'google');
        const connections = await seeders.createConnectionSeed({ env, provider: 'test-replace' });

        const { connection_id, provider_config_key } = connections;

        const initialMetadata = {
            name: 'test',
            host: 'test'
        };

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                connection_id,
                provider_config_key,
                metadata: initialMetadata
            }
        });

        expect(res.res.status).toBe(201);
        expect(res.json).toEqual({
            connection_id,
            provider_config_key,
            metadata: initialMetadata
        });

        const { response: connection } = await connectionService.getConnection(connection_id, provider_config_key, env.id);

        expect(connection?.metadata).toEqual(initialMetadata);

        const newMetadata = {
            additionalName: 'test23'
        };

        const resTwo = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                connection_id,
                provider_config_key,
                metadata: newMetadata
            }
        });

        expect(resTwo.res.status).toBe(201);
        expect(resTwo.json).toEqual({
            connection_id,
            provider_config_key,
            metadata: newMetadata
        });

        const { response: connectionTwo } = await connectionService.getConnection(connection_id, provider_config_key, env.id);
        expect(connectionTwo?.metadata).toEqual(newMetadata);
    });
});
