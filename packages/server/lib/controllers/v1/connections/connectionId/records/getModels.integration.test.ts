import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { format, migrate as migrateRecords, records } from '@nangohq/records';
import { seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected } from '../../../../../utils/tests.js';

const route = '/api/v1/connections/:connectionId/records/models';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        await migrateRecords();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'GET',
            params: { connectionId: 'test-connection' },
            query: { env: 'dev', provider_config_key: 'github' }
        });

        shouldBeProtected(res);
    });

    it('should get empty record models', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({ data: [] });
    });

    it('should get record models with counts and variants', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await records.upsert({
            records: format
                .formatRecords({
                    data: [
                        { id: 'contact-1', name: 'Ada' },
                        { id: 'contact-2', name: 'Linus' }
                    ],
                    syncId: 'f827f095-b0a0-463d-8016-a1b567d31a18',
                    syncJobId: 1,
                    connectionId: connection.id,
                    model: 'Contact'
                })
                .unwrap(),
            connectionId: connection.id,
            environmentId: env.id,
            model: 'Contact'
        });

        await records.upsert({
            records: format
                .formatRecords({
                    data: [{ id: 'contact-3', name: 'Grace' }],
                    syncId: 'f827f095-b0a0-463d-8016-a1b567d31a19',
                    syncJobId: 2,
                    connectionId: connection.id,
                    model: 'Contact::delta'
                })
                .unwrap(),
            connectionId: connection.id,
            environmentId: env.id,
            model: 'Contact::delta'
        });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data).toStrictEqual([
            {
                model: 'Contact',
                variant: null,
                count: 2,
                size_bytes: expect.any(Number),
                updated_at: expect.toBeIsoDate()
            },
            {
                model: 'Contact',
                variant: 'delta',
                count: 1,
                size_bytes: expect.any(Number),
                updated_at: expect.toBeIsoDate()
            }
        ]);
    });
});
