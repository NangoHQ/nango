import * as z from 'zod';

import type { AgentSessionMetaTool, AgentSessionToolSearchHit } from '../agent/session.js';
import type { BreakdownDimensions } from '../billing/types.js';
import type { CliTelemetryCommand } from '../cli/api.js';
import type { HTTP_METHOD } from '../nangoYaml/index.js';
import type { GrowthAddonState } from '../plans/http.api.js';
import type { UsageMetric } from '../usage/index.js';
import type { AnalyticsEventName, AnalyticsSurface } from './taxonomy.js';

export interface AnalyticsEventDefinition {
    surface: AnalyticsSurface;
    insight: string;
    fires: string;
    properties: z.ZodType;
    structured_properties?: z.ZodType;
    structured_reason?: string;
}

const none = z.record(z.string(), z.never());

// A string at runtime, so the catalogue test still sees a primitive, typed as the union senders must use.
const stringOf = <T extends string>() => z.string() as unknown as z.ZodType<T>;

const usageMetric = stringOf<UsageMetric>();
const breakdownDimension = stringOf<BreakdownDimensions[UsageMetric]>();

const outcome = {
    is_success: z.boolean(),
    log_operation_id: z.string().optional(),
    error_code: z.string().optional()
};

function defineCatalogue<const C extends Record<string, AnalyticsEventDefinition>>(catalogue: C): C {
    return catalogue;
}

/** Senders add `surface`, and the server adds `is_production` when it knows the environment. `properties` lists the rest. */
export const analyticsEventCatalogue = defineCatalogue({
    'billing:usage_view': {
        surface: 'web',
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?',
        fires: 'When the Usage page opens',
        properties: none
    },
    'billing:usage_update': {
        surface: 'web',
        insight: 'Which metrics and dimensions do people break usage down by?',
        fires: 'When someone changes the month, a breakdown, a filter or a series on the Usage page',
        properties: z.union([
            z.object({ change: z.literal('month'), direction: z.enum(['previous', 'next']) }),
            z.object({ change: z.enum(['group', 'filter']), metric: usageMetric, dimension: breakdownDimension }),
            z.object({ change: z.enum(['group_clear', 'filter_clear', 'series_isolate', 'series_toggle']), metric: usageMetric }),
            z.object({ change: z.literal('legacy_metrics'), is_legacy_metrics_shown: z.boolean() })
        ])
    },
    'billing:filter_button_click': {
        surface: 'web',
        insight: 'Which metrics and dimensions do people break usage down by?',
        fires: 'When someone opens the breakdown filter on a usage chart',
        properties: z.object({ metric: usageMetric })
    },
    'billing:copy_button_click': {
        surface: 'web',
        insight: 'Which metrics and dimensions do people break usage down by?',
        fires: 'When someone copies a breakdown value on a usage chart',
        properties: z.object({ metric: usageMetric, dimension: breakdownDimension })
    },
    'billing:open_link_click': {
        surface: 'web',
        insight: 'Which metrics and dimensions do people break usage down by?',
        fires: 'When someone opens the item behind a breakdown value on a usage chart',
        properties: z.object({ metric: usageMetric, dimension: breakdownDimension })
    },
    'billing:invoice_link_click': {
        surface: 'web',
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?',
        fires: 'When someone opens an invoice from the Billing page',
        properties: none
    },
    'billing:portal_link_click': {
        surface: 'web',
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?',
        fires: 'When someone opens the billing portal from the Usage page',
        properties: none
    },
    'billing:upgrade_button_click': {
        surface: 'web',
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?',
        fires: 'When someone clicks to upgrade on a plan card',
        properties: none
    },
    'billing:addon_button_click': {
        surface: 'web',
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?',
        fires: 'When someone clicks the Growth add-on action on the Billing page',
        properties: z.object({ addon_state: stringOf<GrowthAddonState>() })
    },
    'billing:payment_method_button_click': {
        surface: 'web',
        insight: 'How many accounts open Billing & Usage each month, free vs paid, and which parts do they use: usage breakdown, spend alerts, plan change?',
        fires: 'When someone clicks to add a payment method on the Billing page',
        properties: none
    },
    'billing:overdue_alert_link_click': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'When someone follows the overdue-invoice alert in the sidebar',
        properties: none
    },
    'billing:plan_submit': {
        surface: 'server',
        insight: 'How many accounts upgrade and downgrade each month?',
        fires: 'After the server accepts a plan change requested in the dashboard',
        properties: z.object({
            previous_plan: z.string(),
            plan: z.string(),
            previous_has_growth_addon: z.boolean(),
            has_growth_addon: z.boolean(),
            is_downgrade: z.boolean()
        })
    },
    'billing:plan_update': {
        surface: 'server',
        insight: 'How many accounts upgrade and downgrade each month?',
        fires: "After an account's plan changes in our database",
        properties: z.object({
            previous_plan: z.string(),
            plan: z.string(),
            previous_has_growth_addon: z.boolean(),
            has_growth_addon: z.boolean(),
            is_downgrade: z.boolean(),
            is_scheduled: z.boolean()
        })
    },

    'playground:playground_view': {
        surface: 'web',
        insight: 'How many accounts use the API Playground each week?',
        fires: 'When the Playground opens',
        properties: z.object({ source: z.enum(['header', 'connection', 'integration', 'function']) })
    },
    'playground:run_start': {
        surface: 'web',
        insight: 'How many accounts use the API Playground each week?',
        fires: 'When someone runs a function in the Playground',
        properties: z.object({ function_type: z.string(), integration: z.string(), is_run_again: z.boolean() })
    },
    'playground:run_complete': {
        surface: 'web',
        insight: 'How many accounts use the API Playground each week?',
        fires: 'When a Playground run returns a result or an error',
        properties: z.object({
            function_type: z.string(),
            integration: z.string(),
            is_success: z.boolean(),
            run_state: z.string(),
            run_duration_ms: z.number()
        })
    },
    'playground:run_cancel': {
        surface: 'web',
        insight: 'How many accounts use the API Playground each week?',
        fires: 'When someone cancels a running Playground run',
        properties: z.object({ function_type: z.string(), integration: z.string() })
    },

    'connections:create_page_view': {
        surface: 'web',
        insight: 'What share of new accounts reach their first working connection, and how long does it take?',
        fires: 'When the create-connection page opens',
        properties: none
    },
    'connections:create_button_click': {
        surface: 'web',
        insight: 'What share of new accounts reach their first working connection, and how long does it take?',
        fires: 'When someone starts creating a connection from the dashboard',
        properties: z.object({ provider: z.string() })
    },
    'connections:share_link_button_click': {
        surface: 'web',
        insight: 'What share of new accounts reach their first working connection, and how long does it take?',
        fires: 'When someone copies a connect link to share',
        properties: z.object({ provider: z.string() })
    },
    'connections:connection_create': {
        surface: 'web',
        insight: 'Which integrations fail most often during auth?',
        fires: 'When the connect flow started from the dashboard finishes',
        properties: z.union([
            z.object({ provider: z.string(), is_legacy_flow: z.boolean(), is_success: z.literal(true) }),
            z.object({ provider: z.string(), is_legacy_flow: z.boolean(), is_success: z.literal(false), error_code: z.string() })
        ])
    },

    'auth:account_create': {
        surface: 'server',
        insight: 'How many accounts sign up each week, and is that growing?',
        fires: 'After a signup creates a new account, whichever way the person signed up',
        properties: none
    },
    'auth:user_create': {
        surface: 'server',
        insight: 'How many accounts sign up each week, and is that growing?',
        fires: 'After a user is created, including users who join through an invite',
        properties: z.object({ method: z.enum(['password', 'google']) })
    },
    'auth:join_request_submit': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'When someone asks to join an account found for their email domain',
        properties: none
    },
    'auth:two_factor_start': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'When someone starts setting up two-factor authentication',
        properties: none
    },
    'auth:two_factor_complete': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'When the two-factor code is checked at the end of enrolment',
        properties: z.union([z.object({ is_success: z.literal(true) }), z.object({ is_success: z.literal(false), error_code: z.string() })])
    },
    'auth:two_factor_cancel': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'When someone closes two-factor enrolment before finishing',
        properties: z.object({ step: z.enum(['scan', 'save']) })
    },
    'auth:two_factor_remove': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'After two-factor authentication is turned off',
        properties: none
    },
    'auth:recovery_codes_generate': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'After new recovery codes are generated',
        properties: none
    },
    'auth:download_button_click': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'When someone downloads their recovery codes',
        properties: z.object({ flow: z.enum(['enroll', 'regenerate']) })
    },
    'auth:copy_button_click': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'When someone copies recovery codes or a new API key secret',
        properties: z.union([
            z.object({ copied_item: z.literal('recovery_codes'), flow: z.enum(['enroll', 'regenerate']) }),
            z.object({ copied_item: z.literal('api_key_secret') })
        ])
    },
    'auth:password_update': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'After a password change is saved',
        properties: none
    },
    'auth:api_keys_link_click': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'When someone opens API keys from the profile menu',
        properties: none
    },
    'auth:api_key_create': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'After an account API key is created',
        properties: none
    },
    'auth:api_key_delete': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'After an account API key is deleted',
        properties: none
    },

    'audit:export_complete': {
        surface: 'web',
        insight: 'Which dashboard features do accounts use, and how often?',
        fires: 'When an audit trail export finishes or fails',
        properties: z.union([
            z.object({ is_success: z.literal(true), is_truncated: z.boolean() }),
            z.object({ is_success: z.literal(false), error_code: z.string() })
        ])
    },

    'functions:command_start': {
        surface: 'cli',
        insight: 'Which CLI commands do people run, and how often?',
        fires: 'Before a CLI command runs',
        properties: z.object({ command: stringOf<CliTelemetryCommand>(), is_device_ephemeral: z.boolean().optional() })
    },

    'agents:session_start': {
        surface: 'server',
        insight: 'How many accounts create agent sessions each week?',
        fires: 'After an agent session is created',
        properties: z.object({
            agent_session_id: z.string(),
            integration_count: z.number(),
            is_tool_search_enabled: z.boolean(),
            is_execute_enabled: z.boolean(),
            is_proxy_enabled: z.boolean(),
            is_create_connection_enabled: z.boolean()
        })
    },
    'agents:session_end': {
        surface: 'server',
        insight: 'How long do agent sessions last?',
        fires: 'After an agent session is terminated. Expired sessions send nothing',
        properties: z.object({ agent_session_id: z.string(), session_duration_ms: z.number() })
    },
    'agents:tool_call_complete': {
        surface: 'server',
        insight: 'Which tools do agents call most, and which fail most often?',
        fires: 'When a tool call in an agent session returns',
        properties: z.object({
            agent_session_id: z.string(),
            ...outcome,
            tool_name: z.string().optional(),
            meta_tool: stringOf<AgentSessionMetaTool>().optional(),
            is_pinned: z.boolean().optional(),
            integration_id: z.string().optional(),
            underlying_error_code: z.string().optional()
        })
    },
    'agents:proxy_request_complete': {
        surface: 'server',
        insight: 'Which tools do agents call most, and which fail most often?',
        fires: 'When a proxy request from an agent session returns',
        properties: z.object({
            agent_session_id: z.string(),
            meta_tool: z.literal('nango_proxy'),
            ...outcome,
            integration_id: z.string().optional(),
            http_method: stringOf<HTTP_METHOD>().optional(),
            provider: z.string().optional(),
            http_status: z.number().optional(),
            provider_error_code: z.string().optional()
        })
    },
    'agents:tool_search_complete': {
        surface: 'server',
        insight: 'How often does tool search return a tool the agent then uses?',
        fires: 'When a tool search in an agent session returns',
        properties: z.object({
            agent_session_id: z.string(),
            meta_tool: z.literal('nango_tool_search'),
            ...outcome,
            query: z.string().optional(),
            match_count: z.number(),
            related_count: z.number(),
            top_match_confidence: z.number().optional()
        }),
        structured_properties: z.object({
            matches: z.array(z.custom<AgentSessionToolSearchHit>()),
            related: z.array(z.custom<AgentSessionToolSearchHit>())
        }),
        structured_reason: 'Search quality is judged by reading a query next to the tools it returned. The lists are capped by the search limit'
    }
});

type AnalyticsEventCatalogue = typeof analyticsEventCatalogue;
type AnalyticsEventKey = keyof AnalyticsEventCatalogue;

type AssertNever<T extends never> = T;
export type AnalyticsEventNamesAreValid = AssertNever<Exclude<AnalyticsEventKey, AnalyticsEventName>>;

export type AnalyticsEventNameFor<S extends AnalyticsSurface> = {
    [E in AnalyticsEventKey]: S extends AnalyticsEventCatalogue[E]['surface'] ? E : never;
}[AnalyticsEventKey];

export type AnalyticsEventProperties<E extends AnalyticsEventKey> = z.infer<AnalyticsEventCatalogue[E]['properties']>;

// Distributes over a union of names, so properties become optional only when no member requires any.
type HasNoRequiredProperties<E extends AnalyticsEventKey> = E extends unknown
    ? Record<never, never> extends AnalyticsEventProperties<E>
        ? true
        : false
    : never;

export type AnalyticsEventPropertiesInput<E extends AnalyticsEventKey> =
    false extends HasNoRequiredProperties<E> ? { eventProperties: AnalyticsEventProperties<E> } : { eventProperties?: AnalyticsEventProperties<E> };

export type AnalyticsEventPropertiesArgs<E extends AnalyticsEventKey> =
    false extends HasNoRequiredProperties<E> ? [properties: AnalyticsEventProperties<E>] : [properties?: AnalyticsEventProperties<E>];

export type AnalyticsEventStructuredProperties<E extends AnalyticsEventKey> = AnalyticsEventCatalogue[E] extends {
    structured_properties: infer S extends z.ZodType;
}
    ? z.infer<S>
    : never;
