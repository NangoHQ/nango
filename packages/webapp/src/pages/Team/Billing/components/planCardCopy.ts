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
