type HostedMetricKind = 'counter' | 'gauge' | 'histogram';

/** Every metric an installation records, with the kind of instrument that records it. */
const HOSTED_METRICS = {
    'nango.hosted_metric.active_concurrency': 'histogram'
} as const satisfies Record<string, HostedMetricKind>;

type Catalog = typeof HOSTED_METRICS;

/** The names in the catalog. With a kind, only the names recorded with that kind of instrument. */
export type HostedMetricName<K extends HostedMetricKind = HostedMetricKind> = {
    [Name in keyof Catalog]: Catalog[Name] extends K ? Name : never;
}[keyof Catalog];

/** A histogram is stored as one metric per part, named after the histogram with the part as a suffix. */
export const HISTOGRAM_PARTS = ['count', 'sum', 'min', 'max'] as const;

/** The names the metrics have in the table. */
export function storedMetricNames(): string[] {
    return Object.entries<HostedMetricKind>(HOSTED_METRICS).flatMap(([name, kind]) =>
        kind === 'histogram' ? HISTOGRAM_PARTS.map((part) => `${name}.${part}`) : [name]
    );
}
