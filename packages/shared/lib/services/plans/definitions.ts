import type { PlanDefinition } from '@nangohq/types';

export const freePlan: PlanDefinition = {
    name: 'free',
    title: 'Free',
    description: 'For hobby and testing.',
    prevPlan: null,
    nextPlan: ['starter-v2', 'growth-v2', 'enterprise'],
    canChange: true,
    basePrice: 0,
    flags: {
        api_rate_limit_size: 'm',
        environments_max: 2,
        has_otel: false,
        has_sync_variants: false,
        connections_max: 10,
        records_max: 100_000,
        proxy_max: 100_000,
        function_executions_max: 100_000,
        function_compute_gbms_max: 50_000_000,
        webhook_forwards_max: 100_000,
        function_logs_max: 100_000,
        sync_frequency_secs_min: 3600,
        auto_idle: true,
        monthly_actions_max: 1000,
        monthly_active_records_max: 5000,
        has_webhooks_script: false,
        has_webhooks_forward: false,
        can_override_docs_connect_url: false,
        can_customize_connect_ui_theme: false,
        can_disable_connect_ui_watermark: false
    }
};

export const starterV1Plan: PlanDefinition = {
    name: 'starter',
    title: 'Starter (legacy)',
    description: 'For small teams.',
    prevPlan: ['free'],
    nextPlan: null,
    canChange: true,
    hidden: true,
    basePrice: 50,
    flags: {
        api_rate_limit_size: 'l',
        environments_max: 3,
        has_otel: false,
        has_sync_variants: false,
        sync_frequency_secs_min: 3600,
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
        has_webhooks_script: false,
        has_webhooks_forward: false,
        can_override_docs_connect_url: false,
        can_customize_connect_ui_theme: false,
        can_disable_connect_ui_watermark: false
    }
};

export const growthV1Plan: PlanDefinition = {
    name: 'growth',
    title: 'Growth (legacy)',
    description: 'For growing teams.',
    prevPlan: ['free'],
    nextPlan: null,
    canChange: true,
    hidden: true,
    basePrice: 500,
    flags: {
        api_rate_limit_size: 'l',
        environments_max: 10,
        has_otel: true,
        has_sync_variants: true,
        sync_frequency_secs_min: 30,
        auto_idle: false,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        webhook_forwards_max: null,
        function_logs_max: null,
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

export const starterV2Plan: PlanDefinition = {
    name: 'starter-v2',
    title: 'Starter',
    description: 'For small teams.',
    prevPlan: ['free'],
    nextPlan: ['growth-v2', 'enterprise'],
    canChange: true,
    basePrice: 50,
    flags: {
        ...starterV1Plan.flags,
        sync_frequency_secs_min: 30,
        has_sync_variants: true,
        has_webhooks_script: true,
        has_webhooks_forward: true
    }
};

export const growthV2Plan: PlanDefinition = {
    name: 'growth-v2',
    title: 'Growth',
    description: 'For growing teams.',
    prevPlan: ['free', 'starter-v2'],
    nextPlan: ['enterprise'],
    canChange: true,
    basePrice: 500,
    flags: {
        ...growthV1Plan.flags
    }
};

export const enterprisePlan: PlanDefinition = {
    name: 'enterprise',
    title: 'Enterprise',
    description: 'For custom needs.',
    prevPlan: ['free', 'starter', 'growth'],
    nextPlan: null,
    canChange: false,
    cta: 'Contact Us',
    flags: {
        api_rate_limit_size: '2xl',
        environments_max: 10,
        has_otel: true,
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

// Old plans
export const starterLegacyPlan: PlanDefinition = {
    name: 'starter-legacy',
    title: 'Starter (legacy)',
    description: 'Tailored to your scale.',
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

export const scaleLegacyPlan: PlanDefinition = {
    name: 'scale-legacy',
    title: 'Scale (legacy)',
    description: 'Tailored to your scale.',
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
    freePlan,

    // V2 plans
    starterV2Plan,
    growthV2Plan,

    // V1 plans
    starterV1Plan,
    growthV1Plan,

    enterprisePlan,

    // Old plans
    starterLegacyPlan,
    scaleLegacyPlan,
    growthLegacyPlan
];
