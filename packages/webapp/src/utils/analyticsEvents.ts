import type { AnyBreakdownDimension } from '@/pages/Team/Billing/usageBreakdown';
import type { PostOnboardingHearAboutUs, UsageMetric } from '@nangohq/types';

/**
 * The app-wide catalog of product-analytics events and their property shapes. Each key is a
 * PostHog event name (`web:<area>:<action>`), each value the exact properties that event carries.
 * `track` (utils/analytics.tsx) is typed against this map, so event names and properties are
 * checked at compile time and every tracked event is listed in one place.
 *
 * Add new events here as they're introduced.
 *
 * Property values must be PostHog-serializable primitives (string | number | boolean).
 */
export interface AnalyticsEvents {
    // Usage page (Billing)
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

    // Playground
    'web:playground:opened': { source: 'header' | 'connection' | 'integration' | 'function' };
    'web:playground:run:clicked': { function_type: string; integration: string; is_run_again: boolean };
    'web:playground:run:completed': { function_type: string; integration: string; success: boolean; state: string; duration_ms: number };
    'web:playground:run:cancelled': { function_type: string; integration: string };

    // Connection creation
    'web:create_connection:viewed': Record<string, never>;
    'web:create_connection_button:clicked': { provider: string };
    'web:share_connection_link_button:clicked': { provider: string };
    'web:connection_created': { provider: string };
    'web:connection_created:legacy': { provider: string };
    'web:connection_failed': { provider: string; errorType: string; errorMessage: string };

    // Getting started
    'web:getting_started:connect-clicked': Record<string, never>;
    'web:getting_started:connection-created': Record<string, never>;
    'web:getting_started:connection-disconnected': Record<string, never>;
    'web:getting_started:code-snippet-executed': Record<string, never>;
    'web:getting_started:setup-integration-clicked': Record<string, never>;
    'web:getting_started:video:play': Record<string, never>;
    'web:getting_started:video:end': Record<string, never>;
    'web:getting_started:authorize': Record<string, never>;
    'web:getting_started:read': Record<string, never>;
    'web:getting_started:perform': Record<string, never>;
    'web:getting_started:custom': Record<string, never>;

    // Account & onboarding
    'web:account_signup': { user_id: number; email: string; name: string; accountId: number };
    'web:signup:hear_about': { source: PostOnboardingHearAboutUs['Body']['source'] };
}
