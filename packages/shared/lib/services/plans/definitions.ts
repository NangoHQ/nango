import type { PlanDefinition } from '@nangohq/types';

export const freePlan: PlanDefinition = {
    code: 'free',
    title: 'Free',
    description: 'For hobby and testing.',
    prevPlan: null,
    // TODO: drop 'starter-v2' and 'growth-v2' when pay-as-you-go stops being hidden.
    // They're sunset and shouldn't be sold to new accounts, but removing them before
    // the pay-as-you-go card is exposed would leave Free accounts with no self-serve
    // upgrade at all: their cards fall back to "Contact us" and postChange rejects
    // the transition. Existing customers are unaffected either way, their moves are
    // driven by starterV2Plan/growthV2Plan and the downgrade matrix.
    nextPlan: ['starter-v2', 'growth-v2', 'pay-as-you-go', 'enterprise'],
    canChange: true,
    basePrice: 0,
    flags: {
        api_rate_limit_size: 'm',
        environments_max: 2,
        has_otel: false,
        connections_max: 10,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        function_duration_seconds_max: 36_000,
        webhook_forwards_max: null,
        function_logs_max: null,
        sync_frequency_secs_min: 30,
        auto_idle: true,
        monthly_actions_max: 1000,
        monthly_active_records_max: 5000,
        has_webhooks_script: true,
        has_webhooks_forward: true,
        has_rbac: false,
        has_audit_trail_control_plane: false,
        can_override_docs_connect_url: false,
        can_customize_connect_ui_theme: false,
        can_disable_connect_ui_watermark: false,
        sync_function_runtime: 'lambda',
        action_function_runtime: 'lambda',
        webhook_function_runtime: 'lambda',
        on_event_function_runtime: 'lambda',
        function_runtime: 'lambda',
        sync_lambda_checkpoint_required: false,
        lambda_tenant_isolation: true
    }
};

export const starterV1Plan: PlanDefinition = {
    code: 'starter',
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
        sync_frequency_secs_min: 30,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        function_duration_seconds_max: null,
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
        has_rbac: false,
        has_audit_trail_control_plane: true,
        can_override_docs_connect_url: false,
        can_customize_connect_ui_theme: false,
        can_disable_connect_ui_watermark: false,
        lambda_tenant_isolation: true
    }
};

export const growthV1Plan: PlanDefinition = {
    code: 'growth',
    title: 'Growth (legacy)',
    description: 'For growing teams.',
    prevPlan: ['free'],
    nextPlan: null,
    canChange: true,
    hidden: true,
    basePrice: 500,
    flags: {
        api_rate_limit_size: 'xl',
        environments_max: 10,
        has_otel: true,

        sync_frequency_secs_min: 30,
        auto_idle: false,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        function_duration_seconds_max: null,
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
        has_rbac: true,
        has_audit_trail_control_plane: true,
        can_override_docs_connect_url: true,
        can_customize_connect_ui_theme: true,
        can_disable_connect_ui_watermark: true,
        lambda_tenant_isolation: true
    }
};

export const starterV2Plan: PlanDefinition = {
    code: 'starter-v2',
    title: 'Starter',
    description: 'For small teams.',
    prevPlan: ['free'],
    nextPlan: ['enterprise'],
    canChange: true,
    basePrice: 50,
    flags: {
        ...starterV1Plan.flags,
        sync_frequency_secs_min: 30,

        has_webhooks_script: true,
        has_webhooks_forward: true
    }
};

export const growthV2Plan: PlanDefinition = {
    code: 'growth-v2',
    title: 'Growth',
    description: 'For growing teams.',
    prevPlan: ['free'],
    nextPlan: ['enterprise'],
    canChange: true,
    basePrice: 500,
    flags: growthV1Plan.flags
};

export const payAsYouGoPlan: PlanDefinition = {
    code: 'pay-as-you-go',
    title: 'Pay-as-you-go',
    description: 'Usage-based pricing with a monthly minimum.',
    prevPlan: ['free'],
    nextPlan: ['enterprise'],
    canChange: true,
    // TODO: flip the flag once we're ready to roll the plan out.
    // Not offered in the dashboard yet, the billing page work lands separately.
    // Flipping this to false is the only switch needed to expose the plan.
    hidden: true,
    // TODO: this plan has no base fee — it bills fully in arrears against a monthly minimum — so
    // basePrice is display-only here and nothing charges against it. It can't just be dropped: the
    // billing page labels it a "base fee" on the plan card and interpolates it unguarded into the
    // upgrade confirm dialog, which would render "undefined". 50 is at least the right number until
    // the frontend can express a minimum. Revisit with the billing page work.
    basePrice: 50,
    flags: {
        // Starter-level for now, the growth add-on will unlock the growth flags later
        ...starterV2Plan.flags
    }
};

export const enterprisePlan: PlanDefinition = {
    code: 'enterprise',
    title: 'Enterprise',
    description: 'For custom needs.',
    prevPlan: ['free', 'pay-as-you-go', 'starter', 'growth'],
    nextPlan: null,
    canChange: false,
    cta: 'Contact Us',
    flags: {
        api_rate_limit_size: '2xl',
        environments_max: 10,
        has_otel: true,

        sync_frequency_secs_min: 30,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        function_duration_seconds_max: null,
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
        has_rbac: true,
        has_audit_trail_control_plane: true,
        can_override_docs_connect_url: true,
        can_customize_connect_ui_theme: true,
        can_disable_connect_ui_watermark: true,
        lambda_tenant_isolation: true
    }
};

export const enterpriseCloudHostedPlan: PlanDefinition = {
    code: 'enterprise-cloud-hosted',
    title: 'Enterprise (cloud-hosted)',
    description: 'For custom needs.',
    prevPlan: [],
    nextPlan: [],
    canChange: false,
    hidden: true,
    basePrice: 5_000,
    flags: {
        ...growthV2Plan.flags,
        api_rate_limit_size: '2xl'
    }
};

export const freeUncappedPlan: PlanDefinition = {
    code: 'free-uncapped',
    title: 'Free (uncapped)',
    description: 'For custom needs.',
    prevPlan: [],
    nextPlan: [],
    canChange: false,
    hidden: true,
    basePrice: 0,
    flags: growthV2Plan.flags
};

export const startupDealPlan: PlanDefinition = {
    code: 'startup-deal',
    title: 'Startup deal',
    description: 'For YC deals.',
    prevPlan: [],
    nextPlan: [],
    canChange: false,
    hidden: true,
    basePrice: 0,
    flags: growthV2Plan.flags
};

// Old plans
export const starterLegacyPlan: PlanDefinition = {
    code: 'starter-legacy',
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

        sync_frequency_secs_min: 30,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        function_duration_seconds_max: null,
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
        has_rbac: false,
        has_audit_trail_control_plane: true,
        can_override_docs_connect_url: false,
        can_customize_connect_ui_theme: false,
        can_disable_connect_ui_watermark: false,
        lambda_tenant_isolation: true
    }
};

export const scaleLegacyPlan: PlanDefinition = {
    code: 'scale-legacy',
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

        sync_frequency_secs_min: 30,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        function_duration_seconds_max: null,
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
        has_rbac: false,
        has_audit_trail_control_plane: true,
        can_override_docs_connect_url: false,
        can_customize_connect_ui_theme: false,
        can_disable_connect_ui_watermark: false,
        lambda_tenant_isolation: true
    }
};

export const growthLegacyPlan: PlanDefinition = {
    code: 'growth-legacy',
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

        sync_frequency_secs_min: 30,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        function_duration_seconds_max: null,
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
        has_rbac: false,
        has_audit_trail_control_plane: true,
        can_override_docs_connect_url: false,
        can_customize_connect_ui_theme: true,
        can_disable_connect_ui_watermark: true,
        lambda_tenant_isolation: true
    }
};

export const plansList: PlanDefinition[] = [
    freePlan,
    freeUncappedPlan,

    // V2 plans
    starterV2Plan,
    growthV2Plan,

    // Usage-based plan, replaces starter-v2/growth-v2
    payAsYouGoPlan,

    // V1 plans
    starterV1Plan,
    growthV1Plan,

    // Enterprise plans
    enterprisePlan,
    enterpriseCloudHostedPlan,

    // YC deal plans
    startupDealPlan,

    // Old plans
    starterLegacyPlan,
    scaleLegacyPlan,
    growthLegacyPlan
];

export function getPlanDefinition(code: PlanDefinition['code']): PlanDefinition | null {
    const plan = plansList.find((p) => p.code === code);
    return plan || null;
}
export function isPotentialDowngrade({ from, to }: { from: PlanDefinition['code']; to: PlanDefinition['code'] }): boolean {
    // Matrix defining whether moving from one plan to another is a downgrade
    // true = downgrade, false = not a downgrade
    // Plan hierarchy: free < starter < growth < enterprise
    // Account for all possible combinations, not just the acceptable transitions defined in nextPlan/prevPlan (ie: manual changes in billing system)
    // v2 plans are equivalent to their non-v2 counterparts (lateral moves = not downgrades)
    // legacy plans are equivalent to their current counterparts (lateral moves = not downgrades)
    // scale-legacy is positioned between growth and enterprise
    const downgradeMatrix = {
        free: {
            free: false,
            'pay-as-you-go': false,
            'starter-v2': false,
            'growth-v2': false,
            starter: false,
            growth: false,
            enterprise: false,
            'starter-legacy': false,
            'scale-legacy': false,
            'growth-legacy': false,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        'starter-v2': {
            free: true,
            'pay-as-you-go': false,
            'starter-v2': false,
            'growth-v2': false,
            starter: false,
            growth: false,
            enterprise: false,
            'starter-legacy': false,
            'scale-legacy': false,
            'growth-legacy': false,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        'growth-v2': {
            free: true,
            'pay-as-you-go': false,
            'starter-v2': true,
            'growth-v2': false,
            starter: true,
            growth: false,
            enterprise: false,
            'starter-legacy': true,
            'scale-legacy': false,
            'growth-legacy': false,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        'pay-as-you-go': {
            // Base flags are starter-level, so this row mirrors 'starter-v2'.
            free: true,
            'pay-as-you-go': false,
            'starter-v2': false,
            'growth-v2': false,
            starter: false,
            growth: false,
            enterprise: false,
            'starter-legacy': false,
            'scale-legacy': false,
            'growth-legacy': false,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        starter: {
            free: true,
            'pay-as-you-go': false,
            'starter-v2': false,
            'growth-v2': false,
            starter: false,
            growth: false,
            enterprise: false,
            'starter-legacy': false,
            'scale-legacy': false,
            'growth-legacy': false,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        growth: {
            free: true,
            'pay-as-you-go': false,
            'starter-v2': true,
            'growth-v2': false,
            starter: true,
            growth: false,
            enterprise: false,
            'starter-legacy': true,
            'scale-legacy': false,
            'growth-legacy': false,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        enterprise: {
            free: true,
            'pay-as-you-go': true,
            'starter-v2': true,
            'growth-v2': true,
            starter: true,
            growth: true,
            enterprise: false,
            'starter-legacy': true,
            'scale-legacy': true,
            'growth-legacy': true,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        'starter-legacy': {
            free: true,
            'pay-as-you-go': false,
            'starter-v2': false,
            'growth-v2': false,
            starter: false,
            growth: false,
            enterprise: false,
            'starter-legacy': false,
            'scale-legacy': false,
            'growth-legacy': false,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        'growth-legacy': {
            free: true,
            'pay-as-you-go': false,
            'starter-v2': true,
            'growth-v2': false,
            starter: true,
            growth: false,
            enterprise: false,
            'starter-legacy': true,
            'scale-legacy': false,
            'growth-legacy': false,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        'scale-legacy': {
            free: true,
            'pay-as-you-go': false,
            'starter-v2': true,
            'growth-v2': true,
            starter: true,
            growth: true,
            enterprise: false,
            'starter-legacy': true,
            'scale-legacy': false,
            'growth-legacy': true,
            'enterprise-cloud-hosted': false,
            'free-uncapped': false,
            'startup-deal': false
        },
        'enterprise-cloud-hosted': {
            // any movement from this plan should be treated as a downgrade, meaning
            // the new plan's flags will be adopted and any overrides from the current
            // plan will be dropped.
            free: true,
            'pay-as-you-go': true,
            'starter-v2': true,
            'growth-v2': true,
            enterprise: true,
            'enterprise-cloud-hosted': false,
            'free-uncapped': true,
            'startup-deal': true,
            // deprecated plans: the transition shouldn't matter as it won't happen
            starter: true,
            growth: true,
            'starter-legacy': true,
            'scale-legacy': true,
            'growth-legacy': true
        },
        'free-uncapped': {
            // any movement from this plan should be treated as a downgrade, meaning
            // the new plan's flags will be adopted and any overrides from the current
            // plan will be dropped.
            free: true,
            'pay-as-you-go': true,
            'starter-v2': true,
            'growth-v2': true,
            enterprise: true,
            'enterprise-cloud-hosted': true,
            'free-uncapped': false,
            'startup-deal': true,
            // deprecated plans: the transition shouldn't matter as it won't happen
            starter: true,
            growth: true,
            'starter-legacy': true,
            'scale-legacy': true,
            'growth-legacy': true
        },
        'startup-deal': {
            // at the end of the startup deal, accounts are scheduled for migration
            // to the growth-v2 plan. To accommodate the unlikely scenario of migrations
            // into enterprise plans, we treat these transitions as NOT downgrades.
            // Any other transitions are unexpected and are treated as a downgrade,
            // meaning the new plan's flags will be adopted and any overrides from
            // the current plan will be dropped.
            free: true,
            // TODO: revisit this once the growth add-on is implemented, as it will
            // likely interplay with it. We don't want customers coming from startup-
            // deals to lose the feature set they had enabled while on trial, so this
            // flag achieves that for now.
            'pay-as-you-go': false,
            'starter-v2': true,
            'growth-v2': false,
            enterprise: false,
            'enterprise-cloud-hosted': false,
            'free-uncapped': true,
            'startup-deal': false,
            // deprecated plans: the transition shouldn't matter as it won't happen
            starter: true,
            growth: true,
            'starter-legacy': true,
            'scale-legacy': true,
            'growth-legacy': true
        }
    } satisfies Record<PlanDefinition['code'], Record<PlanDefinition['code'], boolean>>;
    return downgradeMatrix[from][to];
}
