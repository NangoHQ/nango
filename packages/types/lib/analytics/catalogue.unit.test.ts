import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import { analyticsEventCatalogue } from './catalogue.js';

import type { AnalyticsEventNameFor } from './catalogue.js';

interface JsonSchema {
    type?: string;
    properties?: Record<string, JsonSchema>;
    anyOf?: JsonSchema[];
}

function propertiesOf(schema: JsonSchema): [string, JsonSchema][] {
    return [...Object.entries(schema.properties ?? {}), ...(schema.anyOf ?? []).flatMap(propertiesOf)];
}

const properties = Object.entries(analyticsEventCatalogue).flatMap(([name, event]) =>
    propertiesOf(z.toJSONSchema(event.properties, { unrepresentable: 'any' }) as JsonSchema).map(([key, schema]) => ({
        id: `${name} ${key}`,
        key,
        type: schema.type
    }))
);

describe('analytics event catalogue', () => {
    it('keeps the app copy event available while registering website clicks and successful copies', () => {
        expectTypeOf<'onboarding:copy_prompt_button_click'>().toExtend<AnalyticsEventNameFor<'web'>>();
        expectTypeOf<'onboarding:copy_prompt_button_click'>().toExtend<AnalyticsEventNameFor<'website'>>();
        expectTypeOf<'onboarding:copy_prompt_button_complete'>().toExtend<AnalyticsEventNameFor<'website'>>();
        expectTypeOf<'onboarding:copy_prompt_button_complete'>().not.toExtend<AnalyticsEventNameFor<'web'>>();

        const click = analyticsEventCatalogue['onboarding:copy_prompt_button_click'].properties;
        expect(click.safeParse({ has_api_key: true }).success).toBe(true);
        expect(click.safeParse({ has_api_key: false, placement: 'hero', prompt_version: 'quickstart-v1' }).success).toBe(true);
        const complete = analyticsEventCatalogue['onboarding:copy_prompt_button_complete'].properties;
        expect(complete.safeParse({ is_success: true, placement: 'closing', prompt_version: 'quickstart-v1' }).success).toBe(true);
        expect(complete.safeParse({ is_success: false, placement: 'closing', prompt_version: 'quickstart-v1' }).success).toBe(false);
    });

    it('reads the properties of every event', () => {
        expect(properties.length).toBeGreaterThan(0);
    });

    it('names properties in snake_case', () => {
        expect(properties.filter((p) => !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(p.key)).map((p) => p.id)).toStrictEqual([]);
    });

    it('prefixes boolean properties with is_ or has_', () => {
        expect(properties.filter((p) => p.type === 'boolean' && !/^(previous_)?(is|has)_/.test(p.key)).map((p) => p.id)).toStrictEqual([]);
    });
});
