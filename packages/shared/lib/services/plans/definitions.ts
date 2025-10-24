import { enterprisePlanFlags, freePlanFlags, growthPlanFlags, starterPlanFlags } from './flags.js';

import type { PlanDefinition } from '@nangohq/types';

/**
 * Latest plans
 */

export const freeV2Plan: PlanDefinition = {
    name: 'free',
    orbVersion: 2,
    title: 'Free',
    description: 'For hobby and testing.',
    isPaid: false,
    prevPlan: null,
    nextPlan: null, // Will be set after all plans are defined
    canChange: true,
    basePrice: 0,
    flags: freePlanFlags
};

export const starterV2Plan: PlanDefinition = {
    name: 'starter',
    orbVersion: 6,
    isPaid: true,
    title: 'Starter',
    description: 'For small teams.',
    prevPlan: null, // Will be set after all plans are defined
    nextPlan: null, // Will be set after all plans are defined
    canChange: true,
    basePrice: 50,
    flags: starterPlanFlags
};

export const growthV2Plan: PlanDefinition = {
    name: 'growth',
    orbVersion: 4,
    isPaid: true,
    title: 'Growth',
    description: 'For growing teams.',
    prevPlan: null, // Will be set after all plans are defined
    nextPlan: null,
    canChange: true,
    basePrice: 500,
    flags: growthPlanFlags
};

// Set up cross-references after all plans are defined
freeV2Plan.nextPlan = [starterV2Plan, growthV2Plan];
starterV2Plan.prevPlan = [freeV2Plan];
starterV2Plan.nextPlan = [growthV2Plan];
growthV2Plan.prevPlan = [freeV2Plan, starterV2Plan];

/**
 * Enterprise plan - Custom needs
 */

export const enterprisePlan: PlanDefinition = {
    name: 'enterprise',
    title: 'Enterprise',
    description: 'For custom needs.',
    isPaid: true,
    prevPlan: null,
    nextPlan: null,
    canChange: false,
    cta: 'Contact Us',
    flags: enterprisePlanFlags
};

/**
 * Legacy Orb plans
 */

export const freeV1Plan: PlanDefinition = {
    name: 'free',
    orbVersion: 1,
    title: 'Free (Legacy)',
    description: 'For hobby and testing.',
    isPaid: false,
    prevPlan: null,
    nextPlan: null,
    hidden: true,
    canChange: false,
    basePrice: 0,
    flags: freePlanFlags
};

export const starterV1Plan: PlanDefinition = {
    name: 'starter',
    orbVersion: [1, 2, 3, 4, 5],
    title: 'Starter (Legacy)',
    description: 'For small teams.',
    isPaid: true,
    prevPlan: [freeV1Plan],
    nextPlan: null,
    canChange: false,
    hidden: true,
    basePrice: 50,
    flags: starterPlanFlags
};

export const growthV1Plan: PlanDefinition = {
    name: 'growth',
    orbVersion: [1, 2, 3],
    title: 'Growth (Legacy)',
    description: 'For growing teams.',
    isPaid: true,
    prevPlan: [freeV1Plan],
    nextPlan: null,
    canChange: false,
    hidden: true,
    basePrice: 500,
    flags: growthPlanFlags
};

/**
 * Legacy non-Orb plans
 */
export const starterLegacyPlan: PlanDefinition = {
    name: 'starter-legacy',
    title: 'Starter (legacy)',
    description: 'Tailored to your scale.',
    isPaid: true,
    prevPlan: [],
    nextPlan: [],
    canChange: false,
    hidden: true,
    flags: starterPlanFlags
};
export const scaleLegacyPlan: PlanDefinition = {
    name: 'scale-legacy',
    title: 'Scale (legacy)',
    description: 'Tailored to your scale.',
    isPaid: true,
    prevPlan: [],
    nextPlan: [],
    canChange: false,
    hidden: true,
    flags: {
        api_rate_limit_size: 'l',
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        sync_frequency_secs_min: 30,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        webhook_forwards_max: null,
        function_logs_max: null,
        auto_idle: false,
        monthly_actions_max: null,
        monthly_active_records_max: null,
        trial_start_at: null,
        trial_end_at: null,
        trial_end_notified_at: null,
        trial_extension_count: 0,
        trial_expired: null,
        has_webhooks_script: true,
        has_webhooks_forward: true,
        can_override_docs_connect_url: false,
        can_customize_connect_ui_theme: false,
        can_disable_connect_ui_watermark: false
    }
};
export const growthLegacyPlan: PlanDefinition = {
    name: 'growth-legacy',
    title: 'Growth (legacy)',
    description: 'Tailored to your scale.',
    isPaid: true,
    prevPlan: [],
    nextPlan: [],
    canChange: false,
    hidden: true,
    flags: {
        api_rate_limit_size: 'l',
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        sync_frequency_secs_min: 30,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        webhook_forwards_max: null,
        function_logs_max: null,
        auto_idle: false,
        monthly_actions_max: null,
        monthly_active_records_max: null,
        trial_start_at: null,
        trial_end_at: null,
        trial_end_notified_at: null,
        trial_extension_count: 0,
        trial_expired: null,
        has_webhooks_script: true,
        has_webhooks_forward: true,
        can_override_docs_connect_url: false,
        can_customize_connect_ui_theme: true,
        can_disable_connect_ui_watermark: true
    }
};

export const plansList: PlanDefinition[] = [
    // Latest plans
    freeV2Plan,
    starterV2Plan,
    growthV2Plan,

    // Enterprise plan - Custom needs
    enterprisePlan,

    // Legacy Orb plans
    freeV1Plan,
    starterV1Plan,
    growthV1Plan,

    // Legacy non-Orb plans
    starterLegacyPlan,
    scaleLegacyPlan,
    growthLegacyPlan
];
