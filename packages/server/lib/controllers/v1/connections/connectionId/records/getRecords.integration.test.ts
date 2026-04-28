import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { format, migrate as migrateRecords, records } from '@nangohq/records';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../../utils/tests.js';

const route = '/api/v1/connections/:connectionId/records';
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
            query: { env: 'dev', provider_config_key: 'github', model: 'Contact' }
        });

        shouldBeProtected(res);
    });

    it('should require the model query parameter', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github' } as any
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_query_params',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['model'] }]
            }
        });
    });

    it('should get paginated records for a model', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await records.upsert({
            records: format
                .formatRecords({
                    data: [
                        { id: 'contact-1', name: 'Ada' },
                        { id: 'contact-2', name: 'Linus' },
                        { id: 'contact-3', name: 'Grace' }
                    ],
                    syncId: 'f827f095-b0a0-463d-8016-a1b567d31a20',
                    syncJobId: 1,
                    connectionId: connection.id,
                    model: 'Contact'
                })
                .unwrap(),
            connectionId: connection.id,
            environmentId: env.id,
            model: 'Contact'
        });

        const firstPage = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', model: 'Contact', limit: 2 }
        });

        isSuccess(firstPage.json);
        expect(firstPage.res.status).toBe(200);
        expect(firstPage.json.data.next_cursor).toEqual(expect.any(String));
        expect(firstPage.json.data.records).toHaveLength(2);
        expect(new Set(firstPage.json.data.records.map((record) => record.id)).size).toBe(2);

        for (const record of firstPage.json.data.records) {
            expect(record).toMatchObject({
                _nango_metadata: {
                    cursor: expect.any(String),
                    deleted_at: null,
                    pruned_at: null,
                    last_action: 'ADDED'
                }
            });
            expect(record._nango_metadata.first_seen_at).toEqual(expect.toBeIsoDateTimezone());
            expect(record._nango_metadata.last_modified_at).toEqual(expect.toBeIsoDateTimezone());
        }

        const secondPage = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', model: 'Contact', limit: 2, cursor: firstPage.json.data.next_cursor! }
        });

        isSuccess(secondPage.json);
        expect(secondPage.res.status).toBe(200);
        expect(secondPage.json.data.next_cursor).toBeNull();
        expect(secondPage.json.data.records).toHaveLength(1);

        const combinedIds = [...firstPage.json.data.records, ...secondPage.json.data.records].map((record) => record.id);
        expect([...combinedIds].sort()).toStrictEqual(['contact-1', 'contact-2', 'contact-3']);

        for (const record of secondPage.json.data.records) {
            expect(record).toMatchObject({
                _nango_metadata: {
                    cursor: expect.any(String),
                    deleted_at: null,
                    pruned_at: null,
                    last_action: 'ADDED'
                }
            });
            expect(record._nango_metadata.first_seen_at).toEqual(expect.toBeIsoDateTimezone());
            expect(record._nango_metadata.last_modified_at).toEqual(expect.toBeIsoDateTimezone());
        }
    });

    it('should default to 20 records when limit is omitted', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await records.upsert({
            records: format
                .formatRecords({
                    data: Array.from({ length: 25 }, (_, index) => ({ id: `contact-${index + 1}`, name: `Contact ${index + 1}` })),
                    syncId: 'f827f095-b0a0-463d-8016-a1b567d31a25',
                    syncJobId: 1,
                    connectionId: connection.id,
                    model: 'Contact'
                })
                .unwrap(),
            connectionId: connection.id,
            environmentId: env.id,
            model: 'Contact'
        });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', model: 'Contact' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.records).toHaveLength(20);
        expect(res.json.data.next_cursor).toEqual(expect.any(String));
    });

    it('should get records for a variant', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await records.upsert({
            records: format
                .formatRecords({
                    data: [{ id: 'contact-variant-1', name: 'Ada' }],
                    syncId: 'f827f095-b0a0-463d-8016-a1b567d31a21',
                    syncJobId: 1,
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
            query: { env: env.name, provider_config_key: 'github', model: 'Contact', variant: 'delta' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data).toStrictEqual({
            next_cursor: null,
            records: [
                {
                    id: 'contact-variant-1',
                    name: 'Ada',
                    _nango_metadata: {
                        cursor: expect.any(String),
                        deleted_at: null,
                        pruned_at: null,
                        first_seen_at: expect.toBeIsoDateTimezone(),
                        last_action: 'ADDED',
                        last_modified_at: expect.toBeIsoDateTimezone()
                    }
                }
            ]
        });
    });

    it('should list metadata only without payload fields when metadata_only=true', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await records.upsert({
            records: format
                .formatRecords({
                    data: [{ id: 'meta-only-1', name: 'Payload' }],
                    syncId: 'f827f095-b0a0-463d-8016-a1b567d31a22',
                    syncJobId: 1,
                    connectionId: connection.id,
                    model: 'Contact'
                })
                .unwrap(),
            connectionId: connection.id,
            environmentId: env.id,
            model: 'Contact'
        });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', model: 'Contact', metadata_only: 'true' } as any
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.records).toHaveLength(1);
        const metaRow = res.json.data.records[0];
        expect(metaRow).toBeDefined();
        expect(metaRow).toEqual({
            id: 'meta-only-1',
            _nango_metadata: {
                cursor: expect.any(String),
                deleted_at: null,
                pruned_at: null,
                first_seen_at: expect.toBeIsoDateTimezone(),
                last_action: 'ADDED',
                last_modified_at: expect.toBeIsoDateTimezone()
            }
        });
        expect(metaRow).not.toHaveProperty('name');
    });

    it('should return an error for a malformed cursor', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        const malformedCursor = Buffer.from('not-a-timestamp||not-a-uuid').toString('base64');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', model: 'Contact', cursor: malformedCursor }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_query_params',
                errors: [{ code: 'custom', message: 'Invalid cursor', path: ['cursor'] }]
            }
        });
    });

    it('should not return records from another connection when using a foreign cursor', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connectionA = await seeders.createConnectionSeed({ env, provider: 'github' });
        const connectionB = await seeders.createConnectionSeed({ env, provider: 'github' });

        await records.upsert({
            records: format
                .formatRecords({
                    data: [
                        { id: 'cross-1', name: 'Alpha' },
                        { id: 'cross-2', name: 'Beta' },
                        { id: 'cross-3', name: 'Gamma' }
                    ],
                    syncId: 'f827f095-b0a0-463d-8016-a1b567d31a24',
                    syncJobId: 1,
                    connectionId: connectionA.id,
                    model: 'Contact'
                })
                .unwrap(),
            connectionId: connectionA.id,
            environmentId: env.id,
            model: 'Contact'
        });

        // Obtain a cursor from connection A
        const pageA = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connectionA.connection_id },
            query: { env: env.name, provider_config_key: 'github', model: 'Contact', limit: 1 }
        });

        isSuccess(pageA.json);
        const cursor = pageA.json.data.next_cursor;
        expect(cursor).toBeDefined();

        // Use cursor from connection A to query connection B (which has no records)
        const resB = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connectionB.connection_id },
            query: { env: env.name, provider_config_key: 'github', model: 'Contact', cursor: cursor! }
        });

        isSuccess(resB.json);
        expect(resB.res.status).toBe(200);
        expect(resB.json.data.records).toHaveLength(0);
        expect(resB.json.data.next_cursor).toBeNull();
    });

    it('should fetch a full record by record_id', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await records.upsert({
            records: format
                .formatRecords({
                    data: [{ id: 'by-id-1', title: 'Full row' }],
                    syncId: 'f827f095-b0a0-463d-8016-a1b567d31a23',
                    syncJobId: 1,
                    connectionId: connection.id,
                    model: 'Issue'
                })
                .unwrap(),
            connectionId: connection.id,
            environmentId: env.id,
            model: 'Issue'
        });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', model: 'Issue', record_id: 'by-id-1' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data).toStrictEqual({
            next_cursor: null,
            records: [
                {
                    id: 'by-id-1',
                    title: 'Full row',
                    _nango_metadata: {
                        cursor: expect.any(String),
                        deleted_at: null,
                        pruned_at: null,
                        first_seen_at: expect.toBeIsoDateTimezone(),
                        last_action: 'ADDED',
                        last_modified_at: expect.toBeIsoDateTimezone()
                    }
                }
            ]
        });
    });
});
