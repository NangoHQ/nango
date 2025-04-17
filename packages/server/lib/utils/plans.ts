import type { PlanDefinition } from '@nangohq/types';

export const plansList: PlanDefinition[] = [
    {
        code: 'free',
        title: 'Free',
        description: 'API authorization only.',
        canUpgrade: true,
        canDowngrade: false,
        flags: {
            api_rate_limit_size: 'm',
            connection_with_scripts_max: 50,
            environments_max: 2,
            has_otel: false,
            has_sync_variants: true,
            name: 'free',
            sync_frequency_secs_min: 30
        }
    },
    {
        code: 'yc',
        title: 'YC Plan',
        description: 'For our friends at YC.',
        canUpgrade: true,
        canDowngrade: false,
        cta: 'Contact Us',
        hidden: true,
        flags: {
            api_rate_limit_size: 'l',
            connection_with_scripts_max: null,
            environments_max: 3,
            has_otel: false,
            has_sync_variants: true,
            name: 'yc',
            sync_frequency_secs_min: 30
        }
    },
    {
        code: 'growth',
        title: 'Growth',
        description: 'Pay-as-you-go integrations.',
        canUpgrade: true,
        canDowngrade: false,
        stripLookupKey: 'growth_2025_04_monthly',
        flags: {
            api_rate_limit_size: 'l',
            connection_with_scripts_max: null,
            environments_max: 3,
            has_otel: false,
            has_sync_variants: true,
            name: 'growth',
            sync_frequency_secs_min: 30
        }
    },
    {
        code: 'enterprise',
        title: 'Enterprise',
        description: 'Tailored to your scale.',
        canUpgrade: false,
        canDowngrade: false,
        cta: 'Contact Us',
        flags: {
            api_rate_limit_size: '2xl',
            connection_with_scripts_max: null,
            environments_max: 10,
            has_otel: true,
            has_sync_variants: true,
            name: 'free',
            sync_frequency_secs_min: 30
        }
    },

    // Old plans
    {
        code: 'starter',
        title: 'Starter',
        description: '',
        canUpgrade: false,
        canDowngrade: false,
        hidden: true,
        flags: {
            api_rate_limit_size: 'l',
            connection_with_scripts_max: null,
            environments_max: 3,
            has_otel: false,
            has_sync_variants: true,
            name: 'growth',
            sync_frequency_secs_min: 30
        }
    },
    {
        code: 'scale',
        title: 'Scale',
        description: '',
        canUpgrade: false,
        canDowngrade: false,
        hidden: true,
        flags: {
            api_rate_limit_size: 'l',
            connection_with_scripts_max: null,
            environments_max: 3,
            has_otel: false,
            has_sync_variants: true,
            name: 'growth',
            sync_frequency_secs_min: 30
        }
    }
];
