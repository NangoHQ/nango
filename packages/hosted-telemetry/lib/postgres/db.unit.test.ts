import { afterEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { destroyHostedTelemetryDb, hostedTelemetryDb } from './db.js';

import type * as NangoUtils from '@nangohq/utils';

const logger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('@nangohq/utils', async () => {
    const actual: typeof NangoUtils = await vi.importActual('@nangohq/utils');
    return { ...actual, getLogger: () => logger };
});

const envs = vi.hoisted(() => ({
    NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL: undefined as string | undefined,
    NANGO_HOSTED_TELEMETRY_POSTGRES_SSL: false,
    NANGO_HOSTED_TELEMETRY_POSTGRES_POOL_MAX: 5,
    NANGO_DB_APPLICATION_NAME: 'test'
}));
vi.mock('../env.js', () => ({ envs }));

vi.mock('@nangohq/database', () => ({
    getDbConfig: ({ timeoutMs }: { timeoutMs: number }) => ({
        client: 'pg',
        connection: { connectionString: 'postgres://main:x@db:5432/nango', application_name: 'main', statement_timeout: timeoutMs },
        pool: { min: 2, max: 30, acquireTimeoutMillis: 30000, createTimeoutMillis: 10000 }
    })
}));

function connection(db: ReturnType<typeof hostedTelemetryDb>): { connectionString: string; application_name: string; statement_timeout: number } {
    return db?.client.config.connection as { connectionString: string; application_name: string; statement_timeout: number };
}

describe('hostedTelemetryDb', () => {
    afterEach(async () => {
        flags.hasHostedTelemetry = false;
        envs.NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL = undefined;
        await destroyHostedTelemetryDb();
    });

    it('is off without the flag, whatever the URL says', () => {
        envs.NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL = 'postgres://telemetry:x@db:5432/telemetry';
        expect(hostedTelemetryDb()).toBeUndefined();
    });

    it('gets its own pool to the main database by default', () => {
        flags.hasHostedTelemetry = true;
        const db = hostedTelemetryDb();
        expect(connection(db)).toEqual({ connectionString: 'postgres://main:x@db:5432/nango', application_name: 'main', statement_timeout: 60_000 });
        expect(db?.client.config.pool).toEqual({ min: 0, max: 5, acquireTimeoutMillis: 30000, createTimeoutMillis: 10000 });
    });

    it('uses the URL when one moves it, and keeps that pool across calls', () => {
        flags.hasHostedTelemetry = true;
        envs.NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL = 'postgres://telemetry:x@db:5432/telemetry';
        const first = hostedTelemetryDb();
        expect(connection(first)).toEqual({
            connectionString: 'postgres://telemetry:x@db:5432/telemetry',
            application_name: 'main',
            statement_timeout: 60_000,
            ssl: false
        });
        expect(hostedTelemetryDb()).toBe(first);
    });

    it('stops waiting on a pool that a running query keeps from closing, and hands out a new one after', async () => {
        flags.hasHostedTelemetry = true;
        const stuck = hostedTelemetryDb();
        vi.spyOn(stuck!, 'destroy').mockReturnValue(new Promise(() => {}));

        const startedAt = performance.now();
        await expect(destroyHostedTelemetryDb({ timeoutMs: 50 })).resolves.toBeUndefined();
        expect(performance.now() - startedAt).toBeLessThan(1_000);
        expect(logger.warning).toHaveBeenCalledWith('Pool destroy stopped waiting after 50ms, a query was still holding a connection');
        expect(hostedTelemetryDb()).not.toBe(stuck);
    });
});
