export type { HostedAttributeKey, HostedAttributes, HostedMetricName } from './catalog.js';
export { PostgresMetricExporter, PRODUCER_ID_ATTRIBUTE } from './exporter.js';
export { migrate } from './postgres/migrate.js';
export { dropExpiredPartitions, ensurePartitions, startPartitionDaemon } from './postgres/partitions.js';
export { HOSTED_TELEMETRY_SCHEMA, HOSTED_TELEMETRY_TABLE } from './postgres/schema.js';
export { getMeter, initHostedTelemetry, producerId, shutdownHostedTelemetry } from './provider.js';
export type { HostedMeter } from './provider.js';
