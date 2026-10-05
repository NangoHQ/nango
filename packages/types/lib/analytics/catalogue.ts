import type { AgentSessionMetaTool, AgentSessionToolSearchHit } from '../agent/session.js';
import type { BreakdownDimensions } from '../billing/types.js';
import type { CliTelemetryCommand } from '../cli/api.js';
import type { HTTP_METHOD } from '../nangoYaml/index.js';
import type { GrowthAddonState } from '../plans/http.api.js';
import type { UsageMetric } from '../usage/index.js';
import type { AnalyticsCatalogueProblems, AssertNoProblems } from './rules.js';

type None = Record<string, never>;
type BreakdownDimension = BreakdownDimensions[UsageMetric];

/** Senders add `surface`, and the server adds `is_production` when it knows the environment. `properties` lists the rest. */
export interface AnalyticsEventCatalogue {
    'billing:usage_view': {
        surface: 'web';
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?';
        fires: 'When the Usage page opens';
        properties: None;
    };
    'billing:usage_update': {
        surface: 'web';
        insight: 'Which metrics and dimensions do people break usage down by?';
        fires: 'When someone changes the month, a breakdown, a filter or a series on the Usage page';
        properties:
            | { change: 'month'; direction: 'previous' | 'next' }
            | { change: 'group' | 'filter'; metric: UsageMetric; dimension: BreakdownDimension }
            | { change: 'group_clear' | 'filter_clear' | 'series_isolate' | 'series_toggle'; metric: UsageMetric }
            | { change: 'legacy_metrics'; is_legacy_metrics_shown: boolean };
    };
    'billing:filter_button_click': {
        surface: 'web';
        insight: 'Which metrics and dimensions do people break usage down by?';
        fires: 'When someone opens the breakdown filter on a usage chart';
        properties: { metric: UsageMetric };
    };
    'billing:copy_button_click': {
        surface: 'web';
        insight: 'Which metrics and dimensions do people break usage down by?';
        fires: 'When someone copies a breakdown value on a usage chart';
        properties: { metric: UsageMetric; dimension: BreakdownDimension };
    };
    'billing:open_link_click': {
        surface: 'web';
        insight: 'Which metrics and dimensions do people break usage down by?';
        fires: 'When someone opens the item behind a breakdown value on a usage chart';
        properties: { metric: UsageMetric; dimension: BreakdownDimension };
    };
    'billing:invoice_link_click': {
        surface: 'web';
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?';
        fires: 'When someone opens an invoice from the Billing page';
        properties: None;
    };
    'billing:portal_link_click': {
        surface: 'web';
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?';
        fires: 'When someone opens the billing portal from the Usage page';
        properties: None;
    };
    'billing:upgrade_button_click': {
        surface: 'web';
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?';
        fires: 'When someone clicks to upgrade on a plan card';
        properties: None;
    };
    'billing:addon_button_click': {
        surface: 'web';
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?';
        fires: 'When someone clicks the Growth add-on action on the Billing page';
        properties: { addon_state: GrowthAddonState };
    };
    'billing:payment_method_button_click': {
        surface: 'web';
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?';
        fires: 'When someone clicks to add a payment method on the Billing page';
        properties: None;
    };
    'billing:overdue_alert_link_click': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'When someone follows the overdue-invoice alert in the sidebar';
        properties: None;
    };
    'billing:plan_submit': {
        surface: 'server';
        insight: 'How many accounts upgrade and downgrade each month?';
        fires: 'After the server accepts a plan change requested in the dashboard';
        properties: { previous_plan: string; plan: string; previous_has_growth_addon: boolean; has_growth_addon: boolean; is_downgrade: boolean };
    };
    'billing:plan_update': {
        surface: 'server';
        insight: 'How many accounts upgrade and downgrade each month?';
        fires: "After an account's plan changes in our database";
        properties: {
            previous_plan: string;
            plan: string;
            previous_has_growth_addon: boolean;
            has_growth_addon: boolean;
            is_downgrade: boolean;
            is_scheduled: boolean;
        };
    };

    'playground:playground_view': {
        surface: 'web';
        insight: 'How many accounts use the API Playground each week?';
        fires: 'When the Playground opens';
        properties: { source: 'header' | 'connection' | 'integration' | 'function' };
    };
    'playground:run_start': {
        surface: 'web';
        insight: 'How many accounts use the API Playground each week?';
        fires: 'When someone runs a function in the Playground';
        properties: { function_type: string; integration: string; is_run_again: boolean };
    };
    'playground:run_complete': {
        surface: 'web';
        insight: 'How many accounts use the API Playground each week?';
        fires: 'When a Playground run returns a result or an error';
        properties: { function_type: string; integration: string; is_success: boolean; run_state: string; run_duration_ms: number };
    };
    'playground:run_cancel': {
        surface: 'web';
        insight: 'How many accounts use the API Playground each week?';
        fires: 'When someone cancels a running Playground run';
        properties: { function_type: string; integration: string };
    };

    'connections:create_page_view': {
        surface: 'web';
        insight: 'What share of new accounts reach their first working connection, and how long does it take?';
        fires: 'When the create-connection page opens';
        properties: None;
    };
    'connections:create_button_click': {
        surface: 'web';
        insight: 'What share of new accounts reach their first working connection, and how long does it take?';
        fires: 'When someone starts creating a connection from the dashboard';
        properties: { provider: string };
    };
    'connections:share_link_button_click': {
        surface: 'web';
        insight: 'What share of new accounts reach their first working connection, and how long does it take?';
        fires: 'When someone copies a connect link to share';
        properties: { provider: string };
    };
    'connections:connection_create': {
        surface: 'web';
        insight: 'Which integrations fail most often during auth?';
        fires: 'When the connect flow started from the dashboard finishes';
        properties:
            | { provider: string; is_legacy_flow: boolean; is_success: true }
            | { provider: string; is_legacy_flow: boolean; is_success: false; error_code: string };
    };

    'auth:account_create': {
        surface: 'server';
        insight: 'How many accounts sign up each week, and is that growing?';
        fires: 'After a signup creates a new account, whichever way the person signed up';
        properties: None;
    };
    'auth:user_create': {
        surface: 'server';
        insight: 'How many accounts sign up each week, and is that growing?';
        fires: 'After a user is created, including users who join through an invite';
        properties: { method: 'password' | 'google' };
    };
    'auth:join_request_submit': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'When someone asks to join an account found for their email domain';
        properties: None;
    };
    'auth:two_factor_start': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'When someone starts setting up two-factor authentication';
        properties: None;
    };
    'auth:two_factor_complete': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'When the two-factor code is checked at the end of enrolment';
        properties: { is_success: true } | { is_success: false; error_code: string };
    };
    'auth:two_factor_cancel': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'When someone closes two-factor enrolment before finishing';
        properties: { step: 'scan' | 'save' };
    };
    'auth:two_factor_remove': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'After two-factor authentication is turned off';
        properties: None;
    };
    'auth:recovery_codes_generate': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'After new recovery codes are generated';
        properties: None;
    };
    'auth:download_button_click': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'When someone downloads their recovery codes';
        properties: { flow: 'enroll' | 'regenerate' };
    };
    'auth:copy_button_click': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'When someone copies recovery codes or a new API key secret';
        properties: { copied_item: 'recovery_codes'; flow: 'enroll' | 'regenerate' } | { copied_item: 'api_key_secret' };
    };
    'auth:password_update': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'After a password change is saved';
        properties: None;
    };
    'auth:api_keys_link_click': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'When someone opens API keys from the profile menu';
        properties: None;
    };
    'auth:api_key_create': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'After an account API key is created';
        properties: None;
    };
    'auth:api_key_delete': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'After an account API key is deleted';
        properties: None;
    };

    'audit:export_complete': {
        surface: 'web';
        insight: 'Which dashboard features do accounts use, and how often?';
        fires: 'When an audit trail export finishes or fails';
        properties: { is_success: true; is_truncated: boolean } | { is_success: false; error_code: string };
    };

    'functions:command_start': {
        surface: 'cli';
        insight: 'Which CLI commands do people run, and how often?';
        fires: 'Before a CLI command runs';
        properties: { command: CliTelemetryCommand; is_device_ephemeral?: boolean };
    };

    'agents:session_start': {
        surface: 'server';
        insight: 'How many accounts create agent sessions each week?';
        fires: 'After an agent session is created';
        properties: {
            agent_session_id: string;
            integration_count: number;
            is_tool_search_enabled: boolean;
            is_execute_enabled: boolean;
            is_proxy_enabled: boolean;
            is_create_connection_enabled: boolean;
        };
    };
    'agents:session_end': {
        surface: 'server';
        insight: 'How long do agent sessions last?';
        fires: 'After an agent session is terminated. Expired sessions send nothing';
        properties: { agent_session_id: string; session_duration_ms: number };
    };
    'agents:tool_call_complete': {
        surface: 'server';
        insight: 'Which tools do agents call most, and which fail most often?';
        fires: 'When a tool call in an agent session returns';
        properties: {
            agent_session_id: string;
            is_success: boolean;
            log_operation_id?: string;
            error_code?: string;
            tool_name?: string;
            meta_tool?: AgentSessionMetaTool;
            is_pinned?: boolean;
            integration_id?: string;
            underlying_error_code?: string;
        };
    };
    'agents:proxy_request_complete': {
        surface: 'server';
        insight: 'Which tools do agents call most, and which fail most often?';
        fires: 'When a proxy request from an agent session returns';
        properties: {
            agent_session_id: string;
            meta_tool: 'nango_proxy';
            is_success: boolean;
            log_operation_id?: string;
            error_code?: string;
            integration_id?: string;
            http_method?: HTTP_METHOD;
            provider?: string;
            http_status?: number;
            provider_error_code?: string;
        };
    };
    'agents:tool_search_complete': {
        surface: 'server';
        insight: 'How often does tool search return a tool the agent then uses?';
        fires: 'When a tool search in an agent session returns';
        properties: {
            agent_session_id: string;
            meta_tool: 'nango_tool_search';
            is_success: boolean;
            log_operation_id?: string;
            error_code?: string;
            query?: string;
            match_count: number;
            related_count: number;
            top_match_confidence?: number;
        };
        structured_properties: { matches: AgentSessionToolSearchHit[]; related: AgentSessionToolSearchHit[] };
        structured_reason: 'Search quality is judged by reading a query next to the tools it returned. The lists are capped by the search limit';
    };
}

export type AnalyticsEventCatalogueIsValid = AssertNoProblems<AnalyticsCatalogueProblems<AnalyticsEventCatalogue>>;

export type AnalyticsEventNameFor<S extends AnalyticsEventCatalogue[keyof AnalyticsEventCatalogue]['surface']> = {
    [E in keyof AnalyticsEventCatalogue]: S extends AnalyticsEventCatalogue[E]['surface'] ? E : never;
}[keyof AnalyticsEventCatalogue];

export type AnalyticsEventProperties<E extends keyof AnalyticsEventCatalogue> = AnalyticsEventCatalogue[E]['properties'];

export type AnalyticsEventStructuredProperties<E extends keyof AnalyticsEventCatalogue> = AnalyticsEventCatalogue[E] extends { structured_properties: infer S }
    ? S
    : never;
