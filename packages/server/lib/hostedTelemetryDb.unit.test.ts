import { afterEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { destroyHostedTelemetryDb, hostedTelemetryDb } from './hostedTelemetryDb.js';

import type { Knex } from 'knex';

const envs = vi.hoisted(() => ({
    NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL: undefined as string | undefined,
    NANGO_HOSTED_TELEMETRY_POSTGRES_SSL: false,
    NANGO_HOSTED_TELEMETRY_POSTGRES_POOL_MAX: 5,
    NANGO_DB_APPLICATION_NAME: 'test'
}));
vi.mock('./env.js', () => ({ envs }));

const main = { main: true } as unknown as Knex;
vi.mock('@nangohq/database', () => ({ default: { knex: { main: true } } }));

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

    it('uses the main database by default', () => {
        flags.hasHostedTelemetry = true;
        expect(hostedTelemetryDb()).toEqual(main);
    });

    it('uses its own pool when a URL moves it, and keeps that pool across calls', () => {
        flags.hasHostedTelemetry = true;
        envs.NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL = 'postgres://telemetry:x@db:5432/telemetry';
        const first = hostedTelemetryDb();
        expect(first).not.toEqual(main);
        expect((first?.client.config.connection as { connectionString: string }).connectionString).toBe('postgres://telemetry:x@db:5432/telemetry');
        expect(hostedTelemetryDb()).toBe(first);
    });
});
