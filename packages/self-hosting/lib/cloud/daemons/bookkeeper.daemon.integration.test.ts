import tracer from 'dd-trace';
import knexFactory from 'knex';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { migrate } from '../db/migrate.js';
import { CUSTOMERS_TABLE } from '../db/schema.js';
import { createCustomer } from '../services/customer.service.js';
import { createInstallationLicense } from '../services/installation-license.service.js';
import { createInstallation, deleteInstallation, markInstallationSeen } from '../services/installation.service.js';
import { bookkeeperTick } from './bookkeeper.daemon.js';

import type { RegistryDb } from '../services/db.js';
import type { DBSelfHostingInstallation } from '@nangohq/types';
import type { Knex } from 'knex';

const schema = 'self_hosting_bookkeeper_test';
const now = new Date('2026-11-20T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

let knex: Knex;
let db: RegistryDb;
let acme: number;

const gauge = vi.spyOn(tracer.dogstatsd, 'gauge');

function reported(metric: string): unknown[][] {
    return gauge.mock.calls.filter(([name]) => name === metric).map(([, value, tags]) => [value, tags]);
}

async function installation(
    name: string,
    props: Partial<Pick<DBSelfHostingInstallation, 'mode' | 'stage' | 'telemetry'>> & { customerId?: number } = {}
): Promise<number> {
    const { customerId = acme, mode = 'byoc', stage = 'production', telemetry } = props;
    return (await createInstallation(db, { customerId, name, mode, stage, ...(telemetry !== undefined && { telemetry }) })).unwrap().id;
}

async function license(installationId: number, expiresInDays: number): Promise<void> {
    const expiresAt = new Date(now.getTime() + expiresInDays * DAY_MS);
    (
        await createInstallationLicense(db, {
            installationId,
            issuedAt: new Date(now.getTime() - 365 * DAY_MS),
            expiresAt,
            graceUntil: new Date(expiresAt.getTime() + 90 * DAY_MS),
            license: 'jws',
            signature: 'sig',
            signingKid: 'nango'
        })
    ).unwrap();
}

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    db = { knex, schema };
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    (await migrate({ knex, schema })).unwrap();
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now });
    await knex.raw('TRUNCATE ??.?? CASCADE', [schema, CUSTOMERS_TABLE]);
    acme = (await createCustomer(db, { name: 'acme' })).unwrap().id;
    gauge.mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('bookkeeperTick', () => {
    it('reports the days left on the active license of every live installation', async () => {
        const renewed = await installation('byoc-acme-production');
        await license(renewed, 5);
        await license(renewed, 40);
        await license(await installation('byoc-acme-staging', { stage: 'staging' }), -3);
        await installation('byoc-acme-development', { stage: 'development' });
        const deleted = await installation('byoc-acme-deleted');
        await license(deleted, 10);
        (await deleteInstallation(db, { id: deleted })).unwrap();

        await bookkeeperTick(db);

        expect(reported('nango.self_hosting.license.expires_in_days')).toStrictEqual([
            [40, { installation: 'byoc-acme-production', customer: 'acme' }],
            [-3, { installation: 'byoc-acme-staging', customer: 'acme' }]
        ]);
    });

    it('reports the hours since an installation with telemetry on was last seen', async () => {
        const seen = await installation('byoc-acme-production');
        (await markInstallationSeen(db, { id: seen, at: new Date(now.getTime() - 36 * HOUR_MS) })).unwrap();
        await installation('byoc-acme-staging', { stage: 'staging' });
        const silent = await installation('acme-on-prem', { mode: 'self_managed', telemetry: false });
        (await markInstallationSeen(db, { id: silent, at: new Date(now.getTime() - 72 * HOUR_MS) })).unwrap();
        const deleted = await installation('byoc-acme-deleted');
        (await markInstallationSeen(db, { id: deleted, at: new Date(now.getTime() - 96 * HOUR_MS) })).unwrap();
        (await deleteInstallation(db, { id: deleted })).unwrap();

        await bookkeeperTick(db);

        expect(reported('nango.self_hosting.installation.last_seen_hours')).toStrictEqual([[36, { installation: 'byoc-acme-production', customer: 'acme' }]]);
    });

    it('counts the live installations by mode and stage', async () => {
        const globex = (await createCustomer(db, { name: 'globex' })).unwrap().id;
        await installation('byoc-acme-production');
        await installation('byoc-globex-production', { customerId: globex });
        await installation('globex-on-prem', { customerId: globex, mode: 'self_managed' });
        await installation('byoc-acme-staging', { stage: 'staging' });
        (await deleteInstallation(db, { id: await installation('byoc-acme-deleted') })).unwrap();

        await bookkeeperTick(db);

        expect(reported('nango.self_hosting.installations')).toStrictEqual([
            [2, { mode: 'byoc', stage: 'production' }],
            [1, { mode: 'byoc', stage: 'staging' }],
            [0, { mode: 'byoc', stage: 'development' }],
            [1, { mode: 'self_managed', stage: 'production' }],
            [0, { mode: 'self_managed', stage: 'staging' }],
            [0, { mode: 'self_managed', stage: 'development' }]
        ]);
    });

    it('reports nothing and marks its span as failed when the registry cannot be read', async () => {
        await installation('byoc-acme-production');
        const span = { setTag: vi.fn() };
        const trace = vi.spyOn(tracer, 'trace').mockImplementation(((_name: string, fn: (span: unknown) => unknown) => fn(span)) as typeof tracer.trace);
        onTestFinished(() => trace.mockRestore());

        await bookkeeperTick({ knex, schema: 'self_hosting_missing' });

        expect(gauge).not.toHaveBeenCalled();
        expect(trace.mock.calls[0]?.[0]).toBe('nango.self_hosting.daemon.bookkeeper');
        expect(span.setTag).toHaveBeenCalledExactlyOnceWith('error', expect.objectContaining({ code: '42P01' }));
    });
});
