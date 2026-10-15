import { randomUUID } from 'node:crypto';

import { createNoopMeter } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

import { hostedTelemetryDb } from './db.js';
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
    /** Exports what the current window holds before the process goes, so a rollout does not lose the last minute. */
    shutdown(): Promise<void>;
}

/** The process that wrote a row: the pod on Kubernetes, the container on ECS, else a name for this boot. */
const PRODUCER_ID = process.env['HOSTNAME'] || randomUUID();

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
                      exporter: new PostgresMetricExporter({
                          knex: store.knex,
                          schema: store.schema ?? HOSTED_TELEMETRY_SCHEMA,
                          exportIntervalMs: store.exportIntervalMs
                      }),
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
        shutdown: async () => {
            try {
                await provider?.forceFlush();
            } finally {
                await provider?.shutdown();
            }
        }
    };
}

const db = hostedTelemetryDb();
export const hostedTelemetry = createHostedTelemetry(db && { knex: db, exportIntervalMs: EXPORT_INTERVAL_MS });
