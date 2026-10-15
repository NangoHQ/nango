import { randomUUID } from 'node:crypto';

import { createNoopMeter } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

import { hostedTelemetryDb } from './db.js';
import { envs } from './env.js';
import { PostgresMetricExporter, PRODUCER_ID_ATTRIBUTE } from './exporter.js';
import { HOSTED_TELEMETRY_SCHEMA } from './postgres/schema.js';

import type { HostedMetricName } from './catalog.js';
import type { Counter, Gauge, Histogram, Meter, MetricOptions } from '@opentelemetry/api';
import type { Knex } from 'knex';

export interface HostedMeter {
    createCounter(name: HostedMetricName, options?: MetricOptions): Counter;
    createHistogram(name: HostedMetricName, options?: MetricOptions): Histogram;
    createGauge(name: HostedMetricName, options?: MetricOptions): Gauge;
}

export interface HostedTelemetry {
    meter(name: string): HostedMeter;
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
    const noop = createNoopMeter();
    const meters = new Map<string, HostedMeter>();
    const wrap = (meter: Meter): HostedMeter => ({
        createCounter: (metric, options) => meter.createCounter(metric, options),
        createHistogram: (metric, options) => meter.createHistogram(metric, options),
        createGauge: (metric, options) => meter.createGauge(metric, options)
    });
    return {
        meter: (name) => {
            let meter = meters.get(name);
            if (!meter) {
                meter = wrap(provider ? provider.getMeter(name) : noop);
                meters.set(name, meter);
            }
            return meter;
        },
        shutdown: async () => {
            await provider?.forceFlush();
            await provider?.shutdown();
        }
    };
}

const db = hostedTelemetryDb();
export const hostedTelemetry = createHostedTelemetry(db && { knex: db, exportIntervalMs: envs.NANGO_HOSTED_TELEMETRY_EXPORT_INTERVAL_MS });
