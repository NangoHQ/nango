import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { createClient } from '@clickhouse/client';
import tracer from 'dd-trace';
import knexFactory from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInstallationServer } from '../../../../installation/server.js';
import { mintInstallationToken } from '../../../../installation/token.js';
import { logger } from '../../../../utils.js';
import { installationsClickhouseClient } from '../../../clickhouse/clickhouse.js';
import { migrate as migrateClickhouse } from '../../../clickhouse/migrate.js';
import { migrate } from '../../../db/migrate.js';
import { createCloudServer } from '../../../server.js';
import { createCustomer } from '../../../services/customer.service.js';
import { createInstallationKey } from '../../../services/installation-key.service.js';
import { createInstallationLicense } from '../../../services/installation-license.service.js';
import { createInstallation } from '../../../services/installation.service.js';
import { TELEMETRY_UPLOAD_MAX_BODY_BYTES } from '../../../uploads/constants.js';
import { route } from './postUploads.js';

import type { RegistryDb } from '../../../services/db.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { Express } from 'express';
import type { Knex } from 'knex';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const schema = 'self_hosting_upload_test';
const database = 'installations_upload_test';
const DAY_MS = 86_400_000;

let knex: Knex;
let db: RegistryDb;
let admin: ClickHouseClient;
let clickhouse: ClickHouseClient;
let api: Server;
let url: string;

async function installation(name: string, { licensed = true }: { licensed?: boolean } = {}): Promise<{ uuid: string; kid: string; privateKeyPem: string }> {
    const customer = (await createCustomer(db, { name: `customer-${name}` })).unwrap();
    const created = (await createInstallation(db, { customerId: customer.id, name, mode: 'byoc', stage: 'production' })).unwrap();
    const { key, privateKeyPem } = (await createInstallationKey(db, { installationId: created.id })).unwrap();
    if (licensed) {
        (
            await createInstallationLicense(db, {
                installationId: created.id,
                issuedAt: new Date(),
                expiresAt: new Date(Date.now() + 365 * DAY_MS),
                graceUntil: new Date(Date.now() + 455 * DAY_MS),
                license: 'jws',
                signature: 'sig',
                signingKid: 'nango'
            })
        ).unwrap();
    }
    return { uuid: created.uuid, kid: key.kid, privateKeyPem };
}

const row = (overrides: Record<string, unknown> = {}) => ({
    kind: 'row',
    ts: '2026-11-08T00:00:00.000Z',
    metric: 'nango.hosted_metric.active_concurrency.max',
    attributes: {},
    value: 1,
    ...overrides
});

const upload = (installationId: string, rows: Record<string, unknown>[]) =>
    gzipSync(Buffer.from([{ kind: 'header', installation_id: installationId }, ...rows].map((line) => JSON.stringify(line)).join('\n')));

async function post(
    body: Buffer,
    { token, headers = {}, to = url }: { token?: string | undefined; headers?: Record<string, string>; to?: string } = {}
): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${to}${route.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/gzip', ...(token && { authorization: `Bearer ${token}` }), ...headers },
        body
    });
    return { status: res.status, json: await res.json() };
}

const send = async (privateKeyPem: string, body: Buffer) => post(body, { token: await mintInstallationToken(privateKeyPem, { body }) });

async function stored(installationId: string): Promise<{ ts: string; metric: string; attributes: string; value: number }[]> {
    const res = await admin.query({
        query: `SELECT ts, metric, attributes, value FROM {db:Identifier}.metrics FINAL WHERE installation_id = {id:UUID} ORDER BY metric, ts, attributes`,
        format: 'JSONEachRow',
        query_params: { db: database, id: installationId }
    });
    return res.json();
}

const listen = async (server: Express): Promise<Server> => {
    const listening = server.listen(0);
    await new Promise((resolve) => listening.once('listening', resolve));
    return listening;
};
const address = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const setUser = vi.spyOn(tracer, 'setUser');
const span = { setTag: vi.fn(), addTags: vi.fn() };
vi.spyOn(tracer, 'scope').mockReturnValue({ active: () => span } as unknown as ReturnType<typeof tracer.scope>);

beforeAll(async () => {
    const postgres = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: postgres } });
    db = { knex, schema };
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    (await migrate({ knex, schema })).unwrap();

    const clickhouseUrl = process.env['CLICKHOUSE_URL']!;
    admin = createClient({ url: clickhouseUrl });
    await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
    (await migrateClickhouse({ clickhouseUrl, database })).unwrap();
    clickhouse = installationsClickhouseClient(clickhouseUrl, { database });

    api = await listen(createCloudServer({ db, clickhouse }));
    url = address(api);
});

afterAll(async () => {
    await new Promise((resolve) => api.close(resolve));
    await clickhouse.close();
    await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
    await admin.close();
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

beforeEach(() => {
    setUser.mockClear();
    span.setTag.mockClear();
    span.addTags.mockClear();
});

describe('POST /v1/telemetry/uploads', () => {
    it('stores the rows under the installation of the token', async () => {
        const { uuid, privateKeyPem } = await installation('accepted');

        const res = await send(
            privateKeyPem,
            upload(uuid, [row({ value: 3, attributes: { producer_id: 'a1', environment: 'prod' } }), row({ ts: '2026-11-08T00:01:00.000Z', value: 5 })])
        );

        expect(res).toEqual({ status: 200, json: { rows: 2 } });
        expect(setUser).toHaveBeenCalledExactlyOnceWith({ id: uuid, name: 'accepted' });
        expect(await stored(uuid)).toEqual([
            {
                ts: '2026-11-08 00:00:00.000',
                metric: 'nango.hosted_metric.active_concurrency.max',
                attributes: '{"environment":"prod","producer_id":"a1"}',
                value: 3
            },
            { ts: '2026-11-08 00:01:00.000', metric: 'nango.hosted_metric.active_concurrency.max', attributes: '{}', value: 5 }
        ]);
        expect(span.addTags).toHaveBeenCalledExactlyOnceWith({ 'nango.installationId': uuid, 'nango.upload.rows': 2 });
        expect(span.setTag).not.toHaveBeenCalledWith('error', expect.anything());
    });

    it('a replayed upload leaves one copy of each row', async () => {
        const { uuid, privateKeyPem } = await installation('replayed');
        const body = upload(uuid, [row(), row({ ts: '2026-11-08T00:01:00.000Z' })]);

        expect((await send(privateKeyPem, body)).status).toBe(200);
        expect((await send(privateKeyPem, body)).status).toBe(200);

        expect(await stored(uuid)).toHaveLength(2);
    });

    it('rejects an upload whose header names another installation', async () => {
        const sender = await installation('sender');
        const other = await installation('other');

        const res = await send(sender.privateKeyPem, upload(other.uuid, [row()]));

        expect(res).toEqual({
            status: 403,
            json: { error: { code: 'installation_mismatch', message: 'the header names another installation than the token' } }
        });
        expect(await stored(sender.uuid)).toEqual([]);
        expect(await stored(other.uuid)).toEqual([]);
    });

    it('rejects a request without a token', async () => {
        const { uuid } = await installation('no-token');

        const res = await post(upload(uuid, [row()]));

        expect(res).toMatchObject({ status: 401, json: { error: { code: 'missing_token' } } });
        expect(setUser).not.toHaveBeenCalled();
        expect(await stored(uuid)).toEqual([]);
    });

    it('rejects a token minted for another body', async () => {
        const { uuid, kid, privateKeyPem } = await installation('other-body');
        const token = await mintInstallationToken(privateKeyPem, { body: upload(uuid, [row({ value: 1 })]) });
        const warning = vi.spyOn(logger, 'warning');

        const res = await post(upload(uuid, [row({ value: 1000 })]), { token });

        expect(res).toMatchObject({ status: 401, json: { error: { code: 'body_mismatch' } } });
        expect(warning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('body_mismatch'), { kid }, undefined);
        warning.mockRestore();
        expect(await stored(uuid)).toEqual([]);
    });

    it('rejects an installation without a license', async () => {
        const { uuid, privateKeyPem } = await installation('unlicensed', { licensed: false });

        const res = await send(privateKeyPem, upload(uuid, [row()]));

        expect(res).toMatchObject({ status: 403, json: { error: { code: 'no_license' } } });
        expect(await stored(uuid)).toEqual([]);
    });

    it('rejects the whole upload when one row is invalid', async () => {
        const { uuid, privateKeyPem } = await installation('invalid-row');

        const res = await send(privateKeyPem, upload(uuid, [row(), row({ value: 'many' })]));

        expect(res).toEqual({ status: 400, json: { error: { code: 'invalid_row', message: 'line 3 is not a valid row' } } });
        expect(span.setTag).toHaveBeenCalledWith('error', new Error('invalid_row: line 3 is not a valid row'));
        expect(await stored(uuid)).toEqual([]);
    });

    it('rejects a body over the size limit, and logs the key the request claims to be from', async () => {
        const { kid, privateKeyPem } = await installation('oversized');
        const warning = vi.spyOn(logger, 'warning');
        try {
            const res = await post(Buffer.alloc(TELEMETRY_UPLOAD_MAX_BODY_BYTES + 1), {
                token: await mintInstallationToken(privateKeyPem, { body: Buffer.alloc(0) })
            });

            expect(res).toMatchObject({ status: 413, json: { error: { code: 'request_too_large' } } });
            expect(warning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('request_too_large'), { kid }, undefined);
        } finally {
            warning.mockRestore();
        }
    });

    it('rejects a body sent with a content encoding', async () => {
        const { uuid, privateKeyPem } = await installation('encoded');
        const body = upload(uuid, [row()]);

        const res = await post(body, { token: await mintInstallationToken(privateKeyPem, { body }), headers: { 'content-encoding': 'gzip' } });

        expect(res).toMatchObject({ status: 400, json: { error: { code: 'invalid_encoding' } } });
        expect(await stored(uuid)).toEqual([]);
    });

    it('answers 500 when the registry cannot be read', async () => {
        const { uuid, privateKeyPem } = await installation('registry-down');
        const unreadable = await listen(createCloudServer({ db: { knex, schema: 'self_hosting_upload_test_nowhere' }, clickhouse }));
        try {
            const body = upload(uuid, [row()]);

            const res = await post(body, { token: await mintInstallationToken(privateKeyPem, { body }), to: address(unreadable) });

            expect(res).toEqual({ status: 500, json: { error: { code: 'registry_unavailable', message: 'the registry is unavailable' } } });
            expect(await stored(uuid)).toEqual([]);
        } finally {
            await new Promise((resolve) => unreadable.close(resolve));
        }
    });

    it('answers 500 when the rows cannot be stored', async () => {
        const { uuid, privateKeyPem } = await installation('insert-failed');
        const nowhere = installationsClickhouseClient(process.env['CLICKHOUSE_URL']!, { database: 'installations_upload_test_nowhere' });
        const broken = await listen(createCloudServer({ db, clickhouse: nowhere }));
        try {
            const body = upload(uuid, [row()]);

            const res = await post(body, { token: await mintInstallationToken(privateKeyPem, { body }), to: address(broken) });

            expect(res).toEqual({ status: 500, json: { error: { code: 'insert_failed', message: 'the upload could not be stored' } } });
        } finally {
            await new Promise((resolve) => broken.close(resolve));
            await nowhere.close();
        }
    });

    it('is not served on the installation side', async () => {
        const installationSide = await listen(createInstallationServer());
        try {
            const res = await post(upload(randomUUID(), [row()]), { token: 'any', to: address(installationSide) });

            expect(res).toEqual({ status: 404, json: { error: { code: 'not_found' } } });
        } finally {
            await new Promise((resolve) => installationSide.close(resolve));
        }
    });

    it('only answers a POST', async () => {
        const res = await fetch(`${url}${route.path}`);

        expect({ status: res.status, json: await res.json() }).toEqual({ status: 404, json: { error: { code: 'not_found' } } });
    });
});
