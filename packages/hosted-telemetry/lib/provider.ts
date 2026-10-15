import { randomUUID } from 'node:crypto';

import { createNoopMeter } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

import { PostgresMetricExporter, PRODUCER_ID_ATTRIBUTE } from './exporter.js';
import { HOSTED_TELEMETRY_SCHEMA } from './postgres/schema.js';

import type { HostedMetricName } from './catalog.js';
import type { Counter, Gauge, Histogram, MetricOptions } from '@opentelemetry/api';
import type { Knex } from 'knex';

export interface HostedMeter {
    createCounter(name: HostedMetricName, options?: MetricOptions): Counter;
    createHistogram(name: HostedMetricName, options?: MetricOptions): Histogram;
    createGauge(name: HostedMetricName, options?: MetricOptions): Gauge;
}

let provider: MeterProvider | undefined;

/** The process that wrote a row: the pod on Kubernetes, the container on ECS, else a name for this boot. */
const PRODUCER_ID = process.env['HOSTNAME'] || randomUUID();

export function producerId(): string {
    return PRODUCER_ID;
}

/** Until a service calls this, every meter is the API's no-op and recording drops the value. */
export function initHostedTelemetry({
    knex,
    schema = HOSTED_TELEMETRY_SCHEMA,
    exportIntervalMs
}: {
    knex: Knex;
    schema?: string;
    exportIntervalMs: number;
}): void {
    if (provider) {
        return;
    }
    provider = new MeterProvider({
        resource: resourceFromAttributes({ [PRODUCER_ID_ATTRIBUTE]: producerId() }),
        readers: [
            new PeriodicExportingMetricReader({
                exporter: new PostgresMetricExporter({ knex, schema, windowMs: exportIntervalMs }),
                exportIntervalMillis: exportIntervalMs
            })
        ]
    });
}

export function getMeter(name: string): HostedMeter {
    const meter = (provider ?? { getMeter: createNoopMeter }).getMeter(name);
    return {
        createCounter: (metric, options) => meter.createCounter(metric, options),
        createHistogram: (metric, options) => meter.createHistogram(metric, options),
        createGauge: (metric, options) => meter.createGauge(metric, options)
    };
}

/** Exports what the current window holds before the process goes, so a rollout does not lose the last minute. */
export async function shutdownHostedTelemetry(): Promise<void> {
    await provider?.forceFlush();
    await provider?.shutdown();
    provider = undefined;
}
