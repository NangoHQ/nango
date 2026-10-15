/** Every metric an installation records, so a name outside the catalog does not compile. */
export type HostedMetricName = 'nango.functions.active_concurrency';

export type HostedAttributeKey = 'environment_id' | 'account_id' | 'integration_id';

export type HostedAttributes = Partial<Record<HostedAttributeKey, string | number | boolean>>;
