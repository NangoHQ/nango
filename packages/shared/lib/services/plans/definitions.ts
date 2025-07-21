import type { PlanDefinition } from '@nangohq/types';

export const freePlan: PlanDefinition = {
    code: 'free',
    title: 'Free',
    description: 'For hobby and testing.',
    prevPlan: null,
    nextPlan: ['starter', 'growth', 'enterprise'],
    orbId: 'free',
    canChange: true,
    basePrice: 0,
    flags: {
        api_rate_limit_size: 'm',
        environments_max: 2,
        has_otel: false,
        has_sync_variants: false,
        connections_max: 10,
        name: 'free',
        sync_frequency_secs_min: 3600,
        auto_idle: true,
        monthly_actions_max: 1000,
        monthly_active_records_max: 5000
    },
    display: {
        features: [
            { title: '10 connections' },
            { title: '1k actions' },
            { title: '5k synced records' },
            { title: '2 environments' },
            { title: 'API authorization' },
            { title: 'Syncs & actions' },
            { title: 'MCP & AI Tools' },
            { title: 'Proxy requests' }
        ],
        sub: 'Certain features of free projects (syncs & actions) are paused after two weeks of inactivity.'
    }
};

export const starterPlan: PlanDefinition = {
    code: 'starter',
    title: 'Starter',
    description: 'For small teams.',
    prevPlan: ['free'],
    nextPlan: ['growth', 'enterprise'],
    canChange: true,
    basePrice: 50,
    orbId: 'starter',
    flags: {
        api_rate_limit_size: 'l',
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        name: 'starter',
        sync_frequency_secs_min: 30,
        auto_idle: false,
        monthly_actions_max: null,
        monthly_active_records_max: null,
        trial_start_at: null,
        trial_end_at: null,
        trial_end_notified_at: null,
        trial_extension_count: 0,
        trial_expired: null
    },
    display: {
        featuresHeading: 'Everything in Free, plus:',
        features: [
            { title: '10 connections', sub: 'then $1 per connection' },
            { title: '1k actions', sub: 'then $0.01 per action' },
            { title: '5k synced records', sub: 'then $0.002 per record' },
            { title: '3 environments' },
            { title: 'SOC 2 Type 2' }
        ]
    }
};

export const growthPlan: PlanDefinition = {
    code: 'growth',
    title: 'Growth',
    description: 'For growing teams.',
    prevPlan: ['free', 'starter'],
    nextPlan: ['enterprise'],
    canChange: true,
    orbId: 'growth',
    basePrice: 500,
    flags: {
        api_rate_limit_size: 'l',
        environments_max: 10,
        has_otel: true,
        has_sync_variants: true,
        name: 'growth',
        sync_frequency_secs_min: 30,
        auto_idle: false,
        monthly_actions_max: null,
        monthly_active_records_max: null,
        trial_start_at: null,
        trial_end_at: null,
        trial_end_notified_at: null,
        trial_extension_count: 0,
        trial_expired: null
    },
    display: {
        featuresHeading: 'Everything in Starter, plus:',
        features: [
            { title: '100 connections', sub: 'then $1 per connection' },
            { title: '10k actions', sub: 'then $0.01 per action' },
            { title: '50k synced records', sub: 'then $0.002 per record' },
            { title: '10 environments' },
            { title: 'Real-time syncing' },
            { title: 'Private Slack channel' },
            { title: 'Request new APIs' }
        ]
    }
};

export const enterprisePlan: PlanDefinition = {
    code: 'enterprise',
    title: 'Enterprise',
    description: 'For custom needs.',
    prevPlan: ['free', 'starter', 'growth'],
    nextPlan: null,
    canChange: false,
    cta: 'Contact Us',
    orbId: 'enterprise',
    flags: {
        api_rate_limit_size: '2xl',
        environments_max: 10,
        has_otel: true,
        has_sync_variants: true,
        name: 'enterprise',
        sync_frequency_secs_min: 30,
        auto_idle: false,
        monthly_actions_max: null,
        monthly_active_records_max: null,
        trial_start_at: null,
        trial_end_at: null,
        trial_end_notified_at: null,
        trial_extension_count: 0,
        trial_expired: null
    },
    display: {
        features: [{ title: 'Custom usage' }, { title: 'Unlimited environments' }, { title: 'Self-hosting' }, { title: 'SAML SSO' }, { title: 'SLAs' }]
    }
};

// Old plans
export const starterLegacyPlan: PlanDefinition = {
    code: 'starter-legacy',
    title: 'Starter (legacy)',
    description: 'Tailored to your scale.',
    prevPlan: ['free'],
    nextPlan: ['starter', 'growth', 'enterprise'],
    canChange: true,
    hidden: true,
    flags: {
        api_rate_limit_size: 'l',
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        name: 'starter-legacy',
        sync_frequency_secs_min: 30,
        auto_idle: false,
        monthly_actions_max: null,
        monthly_active_records_max: null,
        trial_start_at: null,
        trial_end_at: null,
        trial_end_notified_at: null,
        trial_extension_count: 0,
        trial_expired: null
    }
};
export const scaleLegacyPlan: PlanDefinition = {
    code: 'scale-legacy',
    title: 'Scale (legacy)',
    description: 'Tailored to your scale.',
    prevPlan: ['free'],
    nextPlan: ['starter', 'growth', 'enterprise'],
    canChange: true,
    hidden: true,
    flags: {
        api_rate_limit_size: 'l',
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        name: 'scale-legacy',
        sync_frequency_secs_min: 30,
        auto_idle: false,
        monthly_actions_max: null,
        monthly_active_records_max: null,
        trial_start_at: null,
        trial_end_at: null,
        trial_end_notified_at: null,
        trial_extension_count: 0,
        trial_expired: null
    }
};
export const growthLegacyPlan: PlanDefinition = {
    code: 'growth-legacy',
    title: 'Growth (legacy)',
    description: 'Tailored to your scale.',
    prevPlan: ['free'],
    nextPlan: ['starter', 'growth', 'enterprise'],
    canChange: true,
    hidden: true,
    flags: {
        api_rate_limit_size: 'l',
        environments_max: 3,
        has_otel: false,
        has_sync_variants: true,
        name: 'growth-legacy',
        sync_frequency_secs_min: 30,
        auto_idle: false,
        monthly_actions_max: null,
        monthly_active_records_max: null,
        trial_start_at: null,
        trial_end_at: null,
        trial_end_notified_at: null,
        trial_extension_count: 0,
        trial_expired: null
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
