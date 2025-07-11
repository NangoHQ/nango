import type { PlanDefinition } from '@nangohq/types';

export const freePlan: PlanDefinition = {
    code: 'free',
    title: 'Free',
    description: 'API authorization only.',
    canUpgrade: true,
    canDowngrade: false,
    orbId: 'free',
    flags: {
        api_rate_limit_size: 'm',
        connection_with_scripts_max: null,
        environments_max: 2,
        has_otel: false,
        has_sync_variants: false,
        connections_max: 10,
        name: 'free',
        sync_frequency_secs_min: 3600,
        auto_idle: true
    }
};

export const starterPlan: PlanDefinition = {
    code: 'starter',
    title: 'Starter',
    description: 'Tailored to your scale.',
    canUpgrade: false,
    canDowngrade: false,
    flags: {
        api_rate_limit_size: 'l',
        connection_with_scripts_max: null,
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        name: 'starter',
        sync_frequency_secs_min: 30,
        auto_idle: false
    }
};

export const growthPlan: PlanDefinition = {
    code: 'growth',
    title: 'Growth',
    description: 'Pay-as-you-go integrations.',
    canUpgrade: true,
    canDowngrade: false,
    orbId: 'growth',
    flags: {
        api_rate_limit_size: 'l',
        connection_with_scripts_max: null,
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        name: 'growth',
        sync_frequency_secs_min: 30,
        auto_idle: false
    }
};

export const enterprisePlan: PlanDefinition = {
    code: 'enterprise',
    title: 'Enterprise',
    description: 'Tailored to your scale.',
    canUpgrade: false,
    canDowngrade: false,
    cta: 'Contact Us',
    orbId: 'enterprise',
    flags: {
        api_rate_limit_size: '2xl',
        connection_with_scripts_max: null,
        environments_max: 10,
        has_otel: true,
        has_sync_variants: true,
        name: 'enterprise',
        sync_frequency_secs_min: 30,
        auto_idle: false
    }
};

// Old plans
export const starterLegacyPlan: PlanDefinition = {
    code: 'starter-legacy',
    title: 'Starter (legacy)',
    description: 'Tailored to your scale.',
    canUpgrade: false,
    canDowngrade: false,
    hidden: true,
    flags: {
        api_rate_limit_size: 'l',
        connection_with_scripts_max: null,
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        name: 'starter-legacy',
        sync_frequency_secs_min: 30,
        auto_idle: false
    }
};
export const scaleLegacyPlan: PlanDefinition = {
    code: 'scale-legacy',
    title: 'Scale (legacy)',
    description: 'Tailored to your scale.',
    canUpgrade: false,
    canDowngrade: false,
    hidden: true,
    flags: {
        api_rate_limit_size: 'l',
        connection_with_scripts_max: null,
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        name: 'scale-legacy',
        sync_frequency_secs_min: 30,
        auto_idle: false
    }
};
export const growthLegacyPlan: PlanDefinition = {
    code: 'growth-legacy',
    title: 'Growth (legacy)',
    description: 'Tailored to your scale.',
    canUpgrade: false,
    canDowngrade: false,
    hidden: true,
    flags: {
        api_rate_limit_size: 'l',
        connection_with_scripts_max: null,
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        name: 'growth-legacy',
        sync_frequency_secs_min: 30,
        auto_idle: false
    }
};

export const plansList: PlanDefinition[] = [
    freePlan,
    starterPlan,
    growthPlan,
    enterprisePlan,

    // Old plans
    starterLegacyPlan,
    scaleLegacyPlan,
    growthLegacyPlan
];
