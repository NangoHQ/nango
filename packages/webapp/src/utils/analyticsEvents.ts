import type { GrowthAddonState } from '@/pages/Team/Billing/planVisibility';
import type { AnyBreakdownDimension } from '@/pages/Team/Billing/usageBreakdown';
import type { UsageMetric } from '@nangohq/types';

/** Names follow the analytics taxonomy's `category:object_action`; property values stay primitives PostHog can store. */
export interface AnalyticsEvents {
    // Usage page (Billing)
    'billing:usage_view': Record<string, never>;
    'billing:usage_update':
        | { change: 'month'; direction: 'previous' | 'next' }
        | { change: 'group' | 'filter'; metric: UsageMetric; dimension: AnyBreakdownDimension }
        | { change: 'group_clear' | 'filter_clear' | 'series_isolate' | 'series_toggle'; metric: UsageMetric }
        | { change: 'legacy_metrics'; is_legacy_metrics_shown: boolean };
    'billing:filter_button_click': { metric: UsageMetric };
    'billing:copy_button_click': { metric: UsageMetric; dimension: AnyBreakdownDimension };
    'billing:open_link_click': { metric: UsageMetric; dimension: AnyBreakdownDimension };
    'billing:invoice_link_click': Record<string, never>;
    'billing:portal_link_click': Record<string, never>;
    'billing:upgrade_button_click': Record<string, never>;
    'billing:addon_button_click': { addon_state: GrowthAddonState };
    'billing:payment_method_button_click': Record<string, never>;
    'billing:overdue_alert_link_click': Record<string, never>;

    // Playground
    'playground:playground_view': { source: 'header' | 'connection' | 'integration' | 'function' };
    'playground:run_start': { function_type: string; integration: string; is_run_again: boolean };
    'playground:run_complete': { function_type: string; integration: string; is_success: boolean; run_state: string; run_duration_ms: number };
    'playground:run_cancel': { function_type: string; integration: string };

    // Connection creation
    'connections:create_page_view': Record<string, never>;
    'connections:create_button_click': { provider: string };
    'connections:share_link_button_click': { provider: string };
    'connections:connection_create':
        | { provider: string; is_legacy_flow: boolean; is_success: true }
        | { provider: string; is_legacy_flow: boolean; is_success: false; error_code: string };

    // Account & onboarding
    'web:account_signup': { user_id: number; accountId: number };
    'auth:join_request_submit': Record<string, never>;

    // Two-factor authentication
    'auth:two_factor_start': Record<string, never>;
    'auth:two_factor_complete': { is_success: true } | { is_success: false; error_code: string };
    'auth:two_factor_cancel': { step: 'scan' | 'save' };
    'auth:two_factor_remove': Record<string, never>;
    'auth:recovery_codes_generate': Record<string, never>;
    'auth:download_button_click': { flow: 'enroll' | 'regenerate' };

    // Password
    'auth:password_update': Record<string, never>;

    // Account API keys
    'auth:api_keys_link_click': Record<string, never>;
    'auth:api_key_create': Record<string, never>;
    'auth:api_key_delete': Record<string, never>;

    'auth:copy_button_click': { copied_item: 'recovery_codes'; flow: 'enroll' | 'regenerate' } | { copied_item: 'api_key_secret' };
    'audit:export_complete': { is_success: true; is_truncated: boolean } | { is_success: false; error_code: string };
}
