import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import { format, migrate as migrateRecords, records } from '@nangohq/records';

const route = '/records';
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
            query: { model: 'Ticket' },
            headers: { 'connection-id': 't', 'provider-config-key': '' }
        });

        shouldBeProtected(res);
    });

    it('should require model', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error on purpose
        const res = await api.fetch(route, {
            method: 'GET',
            token: env.secret_key
        });
        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_query_params',
                errors: [{ code: 'invalid_type', message: 'Required', path: ['model'] }]
            }
        });
    });

    it('should require headers', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error on purpose
        const res = await api.fetch(route, {
            method: 'GET',
            token: env.secret_key,
            query: { model: 'Ticket' }
        });
        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_headers',
                errors: [
                    { code: 'invalid_type', message: 'Required', path: ['connection-id'] },
                    { code: 'invalid_type', message: 'Required', path: ['provider-config-key'] }
                ]
            }
        });
    });

    it('should complain about unknown connection', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            token: env.secret_key,
            query: { model: 'Ticket' },
            headers: { 'connection-id': 't', 'provider-config-key': 'a' }
        });
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: { code: 'unknown_connection', message: 'Provided ConnectionId and ProviderConfigKey does not match a valid connection' }
        });
        expect(res.res.status).toBe(400);
    });

    it('should get empty records', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });
        const res = await api.fetch(route, {
            method: 'GET',
            token: env.secret_key,
            query: { model: 'Ticket' },
            headers: { 'connection-id': conn.connection_id, 'provider-config-key': 'github' }
        });
        isSuccess(res.json);
        expect(res.json).toStrictEqual({
            next_cursor: null,
            records: []
        });
        expect(res.res.status).toBe(200);
    });

    it('should get multiple page of records', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

        await records.upsert({
            records: format
                .formatRecords({
                    data: [
                        { id: 'record1', foo: 'bar' },
                        { id: 'record2', foo: 'bar' },
                        { id: 'record3', foo: 'bar' }
                    ],
                    syncId: '695a23e3-64aa-4978-87bf-2cfc9044e675',
                    syncJobId: 1,
                    connectionId: conn.id!,
                    model: 'Ticket'
                })
                .unwrap(),
            connectionId: conn.id!,
            environmentId: env.id,
            model: 'Ticket'
        });

        // Fetch first page
        const resPage1 = await api.fetch(route, {
            method: 'GET',
            token: env.secret_key,
            query: { model: 'Ticket', limit: 2 },
            headers: { 'connection-id': conn.connection_id, 'provider-config-key': 'github' }
        });
        isSuccess(resPage1.json);
        expect(resPage1.json).toStrictEqual<typeof resPage1.json>({
            next_cursor: expect.any(String),
            records: [
                {
                    id: expect.any(String),
                    foo: 'bar',
                    _nango_metadata: {
                        cursor: expect.any(String),
                        deleted_at: null,
                        first_seen_at: expect.toBeIsoDateTimezone(),
                        last_action: 'ADDED',
                        last_modified_at: expect.toBeIsoDateTimezone()
                    }
                },
                {
                    id: expect.any(String),
                    foo: 'bar',
                    _nango_metadata: {
                        cursor: expect.any(String),
                        deleted_at: null,
                        first_seen_at: expect.toBeIsoDateTimezone(),
                        last_action: 'ADDED',
                        last_modified_at: expect.toBeIsoDateTimezone()
                    }
                }
            ]
        });
        expect(resPage1.res.status).toBe(200);

        // Fetch second page
        const resPage2 = await api.fetch(route, {
            method: 'GET',
            token: env.secret_key,
            query: { model: 'Ticket', limit: 2, cursor: resPage1.json.next_cursor! },
            headers: { 'connection-id': conn.connection_id, 'provider-config-key': 'github' }
        });
        isSuccess(resPage2.json);
        expect(resPage2.json).toStrictEqual<typeof resPage2.json>({
            next_cursor: null,
            records: [
                {
                    id: expect.any(String),
                    foo: 'bar',
                    _nango_metadata: {
                        cursor: expect.any(String),
                        deleted_at: null,
                        first_seen_at: expect.toBeIsoDateTimezone(),
                        last_action: 'ADDED',
                        last_modified_at: expect.toBeIsoDateTimezone()
                    }
                }
            ]
        });
    });
});
