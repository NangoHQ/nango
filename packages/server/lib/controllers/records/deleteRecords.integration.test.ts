import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { format, migrate as migrateRecords, records } from '@nangohq/records';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

const route = '/records';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`DELETE ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        await migrateRecords();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { model: 'Ticket', mode: 'soft', until_cursor: 'abc' },
            headers: { 'connection-id': 't', 'provider-config-key': '' }
        });

        shouldBeProtected(res);
    });

    it('should require all mandatory parameters', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error on purpose
        const res = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            query: {} as { model: string; mode: 'soft' | 'hard'; until_cursor: string }
        });
        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_query_params',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['model'] },
                    { code: 'invalid_value', message: 'Invalid option: expected one of "soft"|"hard"', path: ['mode'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['until_cursor'] }
                ]
            }
        });
    });

    it('should require headers', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error on purpose
        const res = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            query: { model: 'Ticket', mode: 'soft', until_cursor: 'abc' }
        });
        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_headers',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['connection-id'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['provider-config-key'] }
                ]
            }
        });
    });

    it('should complain about unknown connection', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            query: { model: 'Ticket', mode: 'soft', until_cursor: 'abc' },
            headers: { 'connection-id': 't', 'provider-config-key': 'a' }
        });
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: { code: 'unknown_connection', message: 'Provided ConnectionId and ProviderConfigKey does not match a valid connection' }
        });
        expect(res.res.status).toBe(400);
    });

    it('should delete page of records', async () => {
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
                    syncId: '00000000-0000-0000-0000-000000000001',
                    syncJobId: 1,
                    connectionId: conn.id,
                    model: 'Ticket'
                })
                .unwrap(),
            connectionId: conn.id,
            environmentId: env.id,
            model: 'Ticket'
        });
        const recs = (
            await records.getRecords({
                connectionId: conn.id,
                model: 'Ticket'
            })
        ).unwrap();
        expect(recs.records.length).toBe(3);

        const cursor = recs.records[1]?._nango_metadata.cursor;
        const cursorLast = recs.records[recs.records.length - 1]?._nango_metadata.cursor;

        // Delete one record (limit 1)
        const res1 = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            query: {
                model: 'Ticket',
                mode: 'soft',
                until_cursor: cursor!,
                limit: 1
            },
            headers: { 'connection-id': conn.connection_id, 'provider-config-key': 'github' }
        });
        isSuccess(res1.json);
        expect(res1.json).toStrictEqual<typeof res1.json>({
            count: 1,
            has_more: true
        });
        expect(res1.res.status).toBe(200);

        // Delete until the cursor (2nd record - inclusive)
        const res2 = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            query: {
                model: 'Ticket',
                mode: 'soft',
                until_cursor: cursor!
            },
            headers: { 'connection-id': conn.connection_id, 'provider-config-key': 'github' }
        });
        isSuccess(res2.json);
        expect(res2.json).toStrictEqual<typeof res2.json>({
            count: 1,
            has_more: false
        });
        expect(res2.res.status).toBe(200);

        // Delete the last record
        const res3 = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            query: {
                model: 'Ticket',
                mode: 'soft',
                until_cursor: cursorLast!
            },
            headers: { 'connection-id': conn.connection_id, 'provider-config-key': 'github' }
        });

        isSuccess(res3.json);
        expect(res3.json).toStrictEqual<typeof res3.json>({
            count: 1,
            has_more: false
        });
        expect(res3.res.status).toBe(200);

        // Try to delete more records (none left)
        const res4 = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            query: {
                model: 'Ticket',
                mode: 'soft',
                until_cursor: cursorLast!
            },
            headers: { 'connection-id': conn.connection_id, 'provider-config-key': 'github' }
        });

        isSuccess(res4.json);
        expect(res4.json).toStrictEqual<typeof res4.json>({
            count: 0,
            has_more: false
        });
        expect(res4.res.status).toBe(200);
    });

    it('should handle updated records', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

        await records.upsert({
            records: format
                .formatRecords({
                    data: [
                        { id: '1', foo: 'bar' },
                        { id: '2', foo: 'bar' },
                        { id: '3', foo: 'bar' }
                    ],
                    syncId: '00000000-0000-0000-0000-000000000002',
                    syncJobId: 1,
                    connectionId: conn.id,
                    model: 'Ticket'
                })
                .unwrap(),
            connectionId: conn.id,
            environmentId: env.id,
            model: 'Ticket'
        });

        const recs = (
            await records.getRecords({
                connectionId: conn.id,
                model: 'Ticket'
            })
        ).unwrap();
        expect(recs.records.length).toBe(3);

        const cursorLast = recs.records[recs.records.length - 1]?._nango_metadata.cursor;

        // Update all but first record to have new cursors
        // This simulates records being updated after the initial fetch
        await records.upsert({
            records: format
                .formatRecords({
                    data: recs.records.slice(1).map((r) => {
                        return { id: r.id, foo: 'baz' };
                    }),
                    syncId: '00000000-0000-0000-0000-000000000003',
                    syncJobId: 2,
                    connectionId: conn.id,
                    model: 'Ticket'
                })
                .unwrap(),
            connectionId: conn.id,
            environmentId: env.id,
            model: 'Ticket'
        });

        const res1 = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            query: {
                model: 'Ticket',
                mode: 'soft',
                until_cursor: cursorLast!,
                limit: 1
            },
            headers: { 'connection-id': conn.connection_id, 'provider-config-key': 'github' }
        });
        isSuccess(res1.json);
        expect(res1.json).toStrictEqual<typeof res1.json>({
            count: 1,
            has_more: true
        });
        expect(res1.res.status).toBe(200);

        // Try to delete more records (none left)
        const res2 = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            query: {
                model: 'Ticket',
                mode: 'soft',
                until_cursor: cursorLast!
            },
            headers: { 'connection-id': conn.connection_id, 'provider-config-key': 'github' }
        });

        isSuccess(res2.json);
        expect(res2.json).toStrictEqual<typeof res2.json>({
            count: 0,
            has_more: false
        });
        expect(res2.res.status).toBe(200);
    });
});
