import type { AnyBreakdownDimension } from '@/pages/Team/Billing/usageBreakdown';
import type { UsageMetric } from '@nangohq/types';

/**
 * The app-wide catalog of product-analytics events and their property shapes. Each key is a
 * PostHog event name (`web:<area>:<action>`), each value the exact properties that event carries.
 * `track` (utils/analytics.tsx) is typed against this map, so event names and properties are
 * checked at compile time and every tracked event is listed in one place.
 *
 * Usage-page events are the first entries; add new events here as they're introduced.
 *
 * Property values must be PostHog-serializable primitives (string | number | boolean).
 */
export interface AnalyticsEvents {
    'web:usage:viewed': Record<string, never>;
    'web:usage:month_changed': { direction: 'previous' | 'next' };
    'web:usage:grouped': { metric: UsageMetric; dimension: AnyBreakdownDimension };
    'web:usage:group_cleared': { metric: UsageMetric };
    'web:usage:filtered': { metric: UsageMetric; dimension: AnyBreakdownDimension };
    'web:usage:filter_cleared': { metric: UsageMetric };
    'web:usage:filter_opened': { metric: UsageMetric };
    'web:usage:applied_to_all': {
        metric: UsageMetric;
        group_dimension: AnyBreakdownDimension | 'none';
        filter_dimension: AnyBreakdownDimension | 'none';
    };
    'web:usage:series_isolated': { metric: UsageMetric };
    'web:usage:series_toggled': { metric: UsageMetric };
    'web:usage:invoice_details_clicked': Record<string, never>;
    'web:usage:billing_portal_clicked': Record<string, never>;
}
