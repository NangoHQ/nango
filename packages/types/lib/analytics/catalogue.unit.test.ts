import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { analyticsEventCatalogue } from './catalogue.js';
import { findCatalogueProblems } from './rules.js';

import type { AnalyticsEventDefinition } from './catalogue.js';

const valid = { surface: 'web', insight: 'An insight', fires: 'When it happens' } as const;
const none = z.record(z.string(), z.never());

function problemsOf(name: string, event: Partial<AnalyticsEventDefinition>): string[] {
    return findCatalogueProblems({ [name]: { ...valid, properties: none, ...event } as AnalyticsEventDefinition });
}

describe('analytics event catalogue', () => {
    it('follows the taxonomy', () => {
        expect(findCatalogueProblems(analyticsEventCatalogue)).toStrictEqual([]);
    });

    it('accepts well-formed events', () => {
        expect(
            problemsOf('billing:plan_update', { properties: z.object({ previous_plan: z.string(), previous_has_growth_addon: z.boolean() }) })
        ).toStrictEqual([]);
        expect(
            problemsOf('playground:run_complete', {
                properties: z.union([z.object({ is_success: z.literal(true) }), z.object({ is_success: z.literal(false), error_code: z.string() })])
            })
        ).toStrictEqual([]);
        expect(
            problemsOf('functions:command_start', { properties: z.object({ command: z.string(), is_device_ephemeral: z.boolean().optional() }) })
        ).toStrictEqual([]);
    });

    it.each([
        ['a hyphen in the name', 'connections:create-button_button_click', {}],
        ['an uppercase name', 'connections:Create_button_click', {}],
        ['the surface in the name', 'web:playground:run_start', {}],
        ['an empty insight', 'billing:plan_update', { insight: ' ' }],
        ['an empty fires', 'billing:plan_update', { fires: '' }],
        ['a camelCase property', 'billing:plan_update', { properties: z.object({ previousPlan: z.string() }) }],
        ['a dot in a property', 'billing:plan_update', { properties: z.object({ 'plan.name': z.string() }) }],
        ['a double underscore in a property', 'billing:plan_update', { properties: z.object({ plan__name: z.string() }) }],
        [
            'a camelCase property in one variant of a union',
            'billing:plan_update',
            { properties: z.union([z.object({ plan: z.string() }), z.object({ newPlan: z.string() })]) }
        ],
        ['a boolean without a prefix', 'billing:plan_update', { properties: z.object({ downgrade: z.boolean() }) }],
        ['a nullable value', 'billing:plan_update', { properties: z.object({ is_downgrade: z.boolean().nullable() }) }],
        ['an array', 'billing:plan_update', { properties: z.object({ plans: z.array(z.string()) }) }],
        ['surface as a property', 'billing:plan_update', { properties: z.object({ surface: z.string() }) }],
        ['is_production as a property', 'billing:plan_update', { properties: z.object({ is_production: z.boolean() }) }],
        ['properties with no named fields', 'billing:plan_update', { properties: z.object({}) }],
        ['a string-keyed record', 'billing:plan_update', { properties: z.record(z.string(), z.string()) }],
        ['a complete event without is_success', 'playground:run_complete', { properties: z.object({ run_duration_ms: z.number() }) }],
        ['a complete event with an optional is_success', 'playground:run_complete', { properties: z.object({ is_success: z.boolean().optional() }) }],
        ['a complete event with no properties', 'playground:run_complete', {}],
        [
            'structured properties without a reason',
            'agents:tool_search_complete',
            { properties: z.object({ is_success: z.boolean() }), structured_properties: z.object({ matches: z.array(z.string()) }) }
        ],
        [
            'structured properties that are not an object',
            'agents:tool_search_complete',
            { properties: z.object({ is_success: z.boolean() }), structured_properties: z.string(), structured_reason: 'A reason' }
        ]
    ] as const)('rejects %s', (_description, name, event) => {
        expect(problemsOf(name, event)).not.toStrictEqual([]);
    });
});
