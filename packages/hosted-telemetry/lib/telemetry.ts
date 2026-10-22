import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { createNoopMeter } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

import { PostgresMetricExporter, PRODUCER_ID_ATTRIBUTE } from './exporter.js';
import { HOSTED_TELEMETRY_SCHEMA } from './postgres/schema.js';

import type { HostedMetricName } from './catalog.js';
import type { Attributes, Counter, Gauge, Histogram } from '@opentelemetry/api';
import type { Knex } from 'knex';

const EXPORT_INTERVAL_MS = 60_000;

export interface HostedTelemetry {
    increment(name: HostedMetricName, value?: number, attributes?: Attributes): void;
    gauge(name: HostedMetricName, value: number, attributes?: Attributes): void;
    histogram(name: HostedMetricName, value: number, attributes?: Attributes): void;
    /**
     * Exports what the current window holds before the process goes, so a rollout does not lose the last minute.
     * With `timeoutMs`, it stops waiting after that long and whatever was not written yet is lost.
     */
    shutdown(opts?: { timeoutMs?: number }): Promise<void>;
}

/** The process that wrote a row. Random so nothing about the customer's infrastructure leaves it. */
const PRODUCER_ID = randomUUID().slice(0, 8);

export function producerId(): string {
    return PRODUCER_ID;
}

/** Without a store, every meter is the API's no-op and recording drops the value. */
export function createHostedTelemetry(store?: { knex: Knex; schema?: string; exportIntervalMs: number }): HostedTelemetry {
    const provider = store
        ? new MeterProvider({
              resource: resourceFromAttributes({ [PRODUCER_ID_ATTRIBUTE]: PRODUCER_ID }),
              readers: [
                  new PeriodicExportingMetricReader({
                      exporter: new PostgresMetricExporter({ knex: store.knex, schema: store.schema ?? HOSTED_TELEMETRY_SCHEMA }),
                      exportIntervalMillis: store.exportIntervalMs
                  })
              ]
          })
        : undefined;
    const meter = provider ? provider.getMeter('hosted-telemetry') : createNoopMeter();
    const counters = new Map<string, Counter>();
    const gauges = new Map<string, Gauge>();
    const histograms = new Map<string, Histogram>();
    const instrument = <T>(cache: Map<string, T>, name: string, create: () => T): T => {
        let found = cache.get(name);
        if (!found) {
            found = create();
            cache.set(name, found);
        }
        return found;
    };
    return {
        increment: (name, value = 1, attributes) => instrument(counters, name, () => meter.createCounter(name)).add(value, attributes),
        gauge: (name, value, attributes) => instrument(gauges, name, () => meter.createGauge(name)).record(value, attributes),
        histogram: (name, value, attributes) => instrument(histograms, name, () => meter.createHistogram(name)).record(value, attributes),
        shutdown: async ({ timeoutMs } = {}) => {
            if (!provider) {
                return;
            }

            const flushed = provider.shutdown();

            if (timeoutMs !== undefined) {
                await Promise.race([flushed, setTimeout(timeoutMs, undefined, { ref: false })]);
                return;
            }

            await flushed;
        }
    };
}

let current = createHostedTelemetry();

/** Called once at boot by the service that owns the pool. Until then every call on `hostedTelemetry` records nothing. */
export function initHostedTelemetry({ knex, schema }: { knex: Knex; schema?: string }): void {
    current = createHostedTelemetry({ knex, ...(schema && { schema }), exportIntervalMs: EXPORT_INTERVAL_MS });
}

export const hostedTelemetry: HostedTelemetry = {
    increment: (name, value, attributes) => current.increment(name, value, attributes),
    gauge: (name, value, attributes) => current.gauge(name, value, attributes),
    histogram: (name, value, attributes) => current.histogram(name, value, attributes),
    shutdown: (opts) => current.shutdown(opts)
};
