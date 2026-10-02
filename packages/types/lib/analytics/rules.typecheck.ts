import type { AnalyticsCatalogueProblems, AssertNoProblems } from './rules.js';

interface Valid {
    surface: 'web';
    insight: 'An insight';
    fires: 'When it happens';
}

type None = Record<string, never>;

export type RulesAcceptValid = AssertNoProblems<
    AnalyticsCatalogueProblems<{
        'billing:plan_update': Valid & { properties: { previous_plan: string; plan: string; previous_has_growth_addon: boolean; is_downgrade: boolean } };
        'connections:create_button_click': Valid & { properties: None };
        'playground:run_complete': Valid & { properties: { is_success: true } | { is_success: false; error_code: string } };
        'functions:command_start': Valid & { properties: { command: string; is_device_ephemeral?: boolean } };
        'web:account_signup': Valid & { properties: { accountId: number } };
    }>
>;

export type RulesRejectHyphenInName = AssertNoProblems<
    // @ts-expect-error a hyphen slips through the UI element wildcard
    AnalyticsCatalogueProblems<{ 'connections:create-button_button_click': Valid & { properties: None } }>
>;

export type RulesRejectUppercaseName = AssertNoProblems<
    // @ts-expect-error an uppercase name
    AnalyticsCatalogueProblems<{ 'connections:Create_button_click': Valid & { properties: None } }>
>;

export type RulesRejectDottedProperty = AssertNoProblems<
    // @ts-expect-error a dot in a property name
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: { 'plan.name': string } } }>
>;

export type RulesRejectDoubleUnderscore = AssertNoProblems<
    // @ts-expect-error a double underscore in a property name
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: { plan__name: string } } }>
>;

export type RulesRejectNullableBoolean = AssertNoProblems<
    // @ts-expect-error null is not a primitive the taxonomy allows
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: { is_downgrade: boolean | null } } }>
>;

export type RulesRejectIsProductionProperty = AssertNoProblems<
    // @ts-expect-error the sender adds `is_production`
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: { is_production: boolean } } }>
>;

export type RulesRejectOpenObject = AssertNoProblems<
    // @ts-expect-error properties with no named fields
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: object } }>
>;

export type RulesRejectStringRecord = AssertNoProblems<
    // @ts-expect-error a string index instead of named fields
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: Record<string, string> } }>
>;

export type RulesRejectOptionalSuccess = AssertNoProblems<
    // @ts-expect-error a complete event whose is_success is optional
    AnalyticsCatalogueProblems<{ 'playground:run_complete': Valid & { properties: { is_success?: boolean } } }>
>;

export type RulesRejectMissingFires = AssertNoProblems<
    // @ts-expect-error an entry without fires
    AnalyticsCatalogueProblems<{ 'billing:plan_update': { surface: 'server'; insight: 'An insight'; properties: None } }>
>;

export type RulesRejectPrimitiveStructured = AssertNoProblems<
    // @ts-expect-error structured properties that are not an object
    AnalyticsCatalogueProblems<{
        'agents:tool_search_complete': Valid & { properties: { is_success: boolean }; structured_properties: string; structured_reason: 'A reason' };
    }>
>;

export type RulesRejectUnknownAction = AssertNoProblems<
    // @ts-expect-error `change` is not an allowed action
    AnalyticsCatalogueProblems<{ 'billing:plan_change': Valid & { properties: None } }>
>;

export type RulesRejectUnknownObject = AssertNoProblems<
    // @ts-expect-error `provider` is not an allowed object
    AnalyticsCatalogueProblems<{ 'connections:provider_create': Valid & { properties: None } }>
>;

export type RulesRejectSurfaceInName = AssertNoProblems<
    // @ts-expect-error the surface is a property, not part of the name
    AnalyticsCatalogueProblems<{ 'web:playground:run_start': Valid & { properties: None } }>
>;

export type RulesRejectCamelCase = AssertNoProblems<
    // @ts-expect-error a camelCase property
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: { previousPlan: string } } }>
>;

export type RulesRejectBareBoolean = AssertNoProblems<
    // @ts-expect-error a boolean without an is_ or has_ prefix
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: { downgrade: boolean } } }>
>;

export type RulesRejectVariantKey = AssertNoProblems<
    // @ts-expect-error a camelCase property in one variant of a union
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: { plan: string } | { newPlan: string } } }>
>;

export type RulesRejectArray = AssertNoProblems<
    // @ts-expect-error an array without a structured_reason
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: { plans: string[] } } }>
>;

export type RulesRejectSurfaceProperty = AssertNoProblems<
    // @ts-expect-error the sender adds `surface`
    AnalyticsCatalogueProblems<{ 'billing:plan_update': Valid & { properties: { surface: string } } }>
>;

export type RulesRejectCompleteWithoutSuccess = AssertNoProblems<
    // @ts-expect-error a complete event without is_success
    AnalyticsCatalogueProblems<{ 'playground:run_complete': Valid & { properties: { run_duration_ms: number } } }>
>;

export type RulesRejectEmptyInsight = AssertNoProblems<
    // @ts-expect-error an empty insight
    AnalyticsCatalogueProblems<{ 'billing:plan_update': { surface: 'server'; insight: ''; fires: 'When it happens'; properties: None } }>
>;

export type RulesRejectStructuredWithoutReason = AssertNoProblems<
    // @ts-expect-error structured properties without a reason
    AnalyticsCatalogueProblems<{ 'agents:tool_search_complete': Valid & { properties: { is_success: boolean }; structured_properties: { matches: string[] } } }>
>;
