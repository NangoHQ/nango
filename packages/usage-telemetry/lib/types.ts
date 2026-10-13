export type UsageMetric = 'nango.functions.active_concurrency.max';
export type UsageAttributeKey = 'environment_id';
export type UsageAttributeValue = string | number | boolean;
export type UsageAttributes = Partial<Record<UsageAttributeKey, UsageAttributeValue>>;

export interface UsagePoint {
    metric: UsageMetric;
    ts: Date;
    attributes: UsageAttributes;
    value: number;
}
