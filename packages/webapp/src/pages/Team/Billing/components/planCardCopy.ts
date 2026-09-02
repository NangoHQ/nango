import type { PlanDefinition } from '@nangohq/types';

/**
 * Static marketing copy for the plan comparison cards. Deliberately not derived from
 * `PlanDefinition.flags` — paid plans set every cap to `null` (uncapped, metered via Orb instead),
 * so the flags can't produce these numbers. Keep in sync with https://nango.dev/pricing.
 */
export const PLAN_CARD_LIMITS: Partial<Record<PlanDefinition['code'], string[]>> = {
    free: [
        '10 connections',
        '100k proxy requests',
        '10h functions compute time',
        '100k function runs',
        '100k function custom logs',
        '100k records',
        '100k webhooks'
    ],
    'starter-v2': [
        '20 connections',
        '200k proxy requests',
        '20h functions compute time',
        '200k function runs',
        '200k function custom logs',
        '200k records',
        '200k webhooks'
    ],
    'growth-v2': [
        '100 connections',
        '1M proxy requests',
        '100h functions compute time',
        '1M function runs',
        '1M function custom logs',
        '1M records',
        '1M webhooks'
    ]
};

export const ENTERPRISE_PLAN_DESCRIPTION = 'Custom needs and volume discounts';

export interface S26PlanCard {
    code: PlanDefinition['code'];
    /** Free-text rather than `basePrice`: Enterprise has no figure and Pay-as-you-go's isn't a flat fee. */
    price: string;
    priceSuffix?: string;
    tagline: string;
    features: string[];
}

/** In the order they are offered. */
export const S26_PLAN_CARDS: readonly S26PlanCard[] = [
    {
        code: 'free',
        price: '$0',
        priceSuffix: '/mo',
        tagline: 'Hard-capped limits, reset every month.',
        features: ['10 connections', '10h compute time', '10GB data transfer', 'API auth with 900+ APIs', 'Pre-built tools, triggers & syncs', 'Logs']
    },
    {
        code: 'pay-as-you-go',
        price: '$50',
        priceSuffix: '/mo minimum',
        tagline: '$50 in credits per month included.',
        features: ['$0.29 / connection / mo', '$0.72 / h of compute time', '$0.50 / GB data transfer', 'SOC 2 Type II', 'Growth add-on available for $450/mo']
    },
    {
        code: 'enterprise',
        price: 'Custom',
        tagline: 'Volume discounts, self-hosting, custom terms.',
        features: [
            'Volume discounts with commitments',
            'Includes Growth add-on',
            'SCIM, audit trail, SLA',
            'Enterprise support',
            'Self-hosting & BYOC options available',
            '2-day requested integration delivery'
        ]
    }
];
