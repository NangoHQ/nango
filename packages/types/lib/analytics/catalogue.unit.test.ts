import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { analyticsEventCatalogue } from './catalogue.js';

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
