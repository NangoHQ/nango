import { afterEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { destroyHostedTelemetryDb, hostedTelemetryDb } from './hostedTelemetryDb.js';

const envs = vi.hoisted(() => ({
    NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL: undefined as string | undefined,
    NANGO_HOSTED_TELEMETRY_POSTGRES_SSL: false,
    NANGO_HOSTED_TELEMETRY_POSTGRES_POOL_MAX: 5,
    NANGO_DB_APPLICATION_NAME: 'test'
}));
vi.mock('./env.js', () => ({ envs }));

vi.mock('@nangohq/database', () => ({
    getDbConfig: () => ({
        client: 'pg',
        connection: { connectionString: 'postgres://main:x@db:5432/nango', application_name: 'main' },
        pool: { min: 2, max: 30 }
    })
}));

function connection(db: ReturnType<typeof hostedTelemetryDb>): { connectionString: string } {
    return db?.client.config.connection as { connectionString: string };
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
        expect(connection(db).connectionString).toBe('postgres://main:x@db:5432/nango');
        expect(db?.client.config.pool).toEqual({ min: 0, max: 5 });
    });

    it('uses the URL when one moves it, and keeps that pool across calls', () => {
        flags.hasHostedTelemetry = true;
        envs.NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL = 'postgres://telemetry:x@db:5432/telemetry';
        const first = hostedTelemetryDb();
        expect(connection(first).connectionString).toBe('postgres://telemetry:x@db:5432/telemetry');
        expect(hostedTelemetryDb()).toBe(first);
    });
});
