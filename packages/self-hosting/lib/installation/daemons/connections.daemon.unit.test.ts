import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hostedTelemetry, initHostedTelemetry } from '@nangohq/hosted-telemetry';
import { flags } from '@nangohq/utils';

import { connectionsDaemon, recordConnections } from './connections.daemon.js';

import type { Knex } from 'knex';

const telemetryDb = vi.hoisted(() => ({ current: undefined as unknown }));
const counts = vi.hoisted(() => ({ current: [] as { isProduction: boolean; active: number; total: number }[] }));

vi.mock('@nangohq/hosted-telemetry', () => ({
    hostedTelemetryDb: () => telemetryDb.current,
    initHostedTelemetry: vi.fn(),
    hostedTelemetry: { gauge: vi.fn() }
}));
vi.mock('@nangohq/shared', () => ({
    connectionService: { countActiveAndTotalConnections: () => Promise.resolve(counts.current) }
}));

const active = 'nango.hosted_metric.active_connections';
const total = 'nango.hosted_metric.connections';

beforeEach(() => {
    flags.hasHostedTelemetryConnections = true;
    telemetryDb.current = {} as Knex;
    counts.current = [];
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('connectionsDaemon', () => {
    it('does not start when the flag is off', () => {
        flags.hasHostedTelemetryConnections = false;

        expect(connectionsDaemon()).toBeUndefined();
        expect(initHostedTelemetry).not.toHaveBeenCalled();
    });

    it('does not start without a telemetry database', () => {
        telemetryDb.current = undefined;

        expect(connectionsDaemon()).toBeUndefined();
        expect(initHostedTelemetry).not.toHaveBeenCalled();
    });

    it('initialises hosted telemetry and records at once', async () => {
        counts.current = [
            { isProduction: true, active: 2, total: 5 },
            { isProduction: false, active: 0, total: 0 }
        ];

        const daemon = connectionsDaemon();
        expect(daemon).toBeDefined();
        await vi.waitFor(() => expect(hostedTelemetry.gauge).toHaveBeenCalledTimes(4));
        await daemon?.abort();

        expect(initHostedTelemetry).toHaveBeenCalledWith({ knex: telemetryDb.current });
        expect(hostedTelemetry.gauge).toHaveBeenCalledWith(active, 2, { is_production: true });
        expect(hostedTelemetry.gauge).toHaveBeenCalledWith(total, 5, { is_production: true });
        expect(hostedTelemetry.gauge).toHaveBeenCalledWith(active, 0, { is_production: false });
        expect(hostedTelemetry.gauge).toHaveBeenCalledWith(total, 0, { is_production: false });
    });
});

describe('recordConnections', () => {
    it('records the active and the total count per production flag', async () => {
        counts.current = [
            { isProduction: true, active: 2, total: 5 },
            { isProduction: false, active: 3, total: 4 }
        ];

        await recordConnections(new Date('2026-11-24T10:00:00Z'));

        expect(vi.mocked(hostedTelemetry.gauge).mock.calls).toStrictEqual([
            [active, 2, { is_production: true }],
            [total, 5, { is_production: true }],
            [active, 3, { is_production: false }],
            [total, 4, { is_production: false }]
        ]);
    });
});
