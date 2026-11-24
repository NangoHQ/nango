import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hostedTelemetry, initHostedTelemetry } from '@nangohq/hosted-telemetry';
import { flags } from '@nangohq/utils';

import { activeConnectionsDaemon, recordActiveConnections } from './activeConnections.daemon.js';

import type { Knex } from 'knex';

const telemetryDb = vi.hoisted(() => ({ current: undefined as unknown }));
const counts = vi.hoisted(() => ({ current: { production: 0, other: 0 } }));

vi.mock('@nangohq/hosted-telemetry', () => ({
    hostedTelemetryDb: () => telemetryDb.current,
    initHostedTelemetry: vi.fn(),
    hostedTelemetry: { gauge: vi.fn() }
}));
vi.mock('@nangohq/shared', () => ({
    connectionService: { countActiveMonthlyConnections: () => Promise.resolve(counts.current) }
}));

const metric = 'nango.hosted_metric.active_connections';

beforeEach(() => {
    flags.hasHostedTelemetryActiveConnections = true;
    telemetryDb.current = {} as Knex;
    counts.current = { production: 0, other: 0 };
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('activeConnectionsDaemon', () => {
    it('does not start when the flag is off', () => {
        flags.hasHostedTelemetryActiveConnections = false;

        expect(activeConnectionsDaemon()).toBeUndefined();
        expect(initHostedTelemetry).not.toHaveBeenCalled();
    });

    it('does not start without a telemetry database', () => {
        telemetryDb.current = undefined;

        expect(activeConnectionsDaemon()).toBeUndefined();
        expect(initHostedTelemetry).not.toHaveBeenCalled();
    });

    it('initialises hosted telemetry and records at once', async () => {
        counts.current = { production: 2, other: 0 };

        const daemon = activeConnectionsDaemon();
        expect(daemon).toBeDefined();
        await vi.waitFor(() => expect(hostedTelemetry.gauge).toHaveBeenCalledTimes(2));
        await daemon?.abort();

        expect(initHostedTelemetry).toHaveBeenCalledWith({ knex: telemetryDb.current });
        expect(hostedTelemetry.gauge).toHaveBeenCalledWith(metric, 2, { is_production: true });
        expect(hostedTelemetry.gauge).toHaveBeenCalledWith(metric, 0, { is_production: false });
    });
});

describe('recordActiveConnections', () => {
    it('records one gauge per production flag', async () => {
        counts.current = { production: 2, other: 3 };

        await recordActiveConnections(new Date('2026-11-24T10:00:00Z'));

        expect(hostedTelemetry.gauge).toHaveBeenCalledWith(metric, 2, { is_production: true });
        expect(hostedTelemetry.gauge).toHaveBeenCalledWith(metric, 3, { is_production: false });
    });
});
