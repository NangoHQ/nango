import type { JSONSchema7Definition } from 'json-schema';

export const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

const DRAFT_07_DEFINITIONS_POINTER = '#/definitions/';
const DEFS_POINTER = '#/$defs/';

const SUBSCHEMA_KEYWORDS = new Set(['additionalProperties', 'contains', 'propertyNames', 'if', 'then', 'else', 'not']);
const SUBSCHEMA_LIST_KEYWORDS = new Set(['allOf', 'anyOf', 'oneOf']);
const SUBSCHEMA_MAP_KEYWORDS = new Set(['properties', 'patternProperties']);

export type JsonSchema202012 = { [keyword: string]: unknown } | boolean;

/**
 * Rewrites a draft-07 schema as 2020-12. Only keywords that hold subschemas are walked, so a property
 * named `definitions` or a `const` that looks like a schema is carried over untouched.
 */
export function draft07ToDraft202012(schema: JSONSchema7Definition): JsonSchema202012 {
    if (typeof schema === 'boolean') {
        return schema;
    }

    const converted: Record<string, unknown> = {};
    for (const [keyword, value] of Object.entries(schema) as [string, unknown][]) {
        if (value === undefined) {
            continue;
        }

        if (keyword === '$schema') {
            continue;
        } else if (keyword === '$ref' && typeof value === 'string') {
            converted['$ref'] = value.startsWith(DRAFT_07_DEFINITIONS_POINTER) ? `${DEFS_POINTER}${value.slice(DRAFT_07_DEFINITIONS_POINTER.length)}` : value;
        } else if (keyword === 'definitions') {
            converted['$defs'] = convertMap(value as Record<string, JSONSchema7Definition>);
        } else if (keyword === 'items') {
            if (Array.isArray(value)) {
                converted['prefixItems'] = value.map((item: JSONSchema7Definition) => draft07ToDraft202012(item));
                if (schema.additionalItems !== undefined) {
                    converted['items'] = draft07ToDraft202012(schema.additionalItems);
                }
            } else {
                converted['items'] = draft07ToDraft202012(value as JSONSchema7Definition);
            }
        } else if (keyword === 'additionalItems') {
            // Only meaningful next to a tuple `items`, where it became `items` above.
            continue;
        } else if (keyword === 'dependencies') {
            for (const [property, dependency] of Object.entries(value as Record<string, JSONSchema7Definition | string[]>)) {
                const target = Array.isArray(dependency) ? 'dependentRequired' : 'dependentSchemas';
                converted[target] = {
                    ...(converted[target] as Record<string, unknown>),
                    [property]: Array.isArray(dependency) ? dependency : draft07ToDraft202012(dependency)
                };
            }
        } else if (SUBSCHEMA_KEYWORDS.has(keyword)) {
            converted[keyword] = draft07ToDraft202012(value as JSONSchema7Definition);
        } else if (SUBSCHEMA_LIST_KEYWORDS.has(keyword)) {
            converted[keyword] = (value as JSONSchema7Definition[]).map((item) => draft07ToDraft202012(item));
        } else if (SUBSCHEMA_MAP_KEYWORDS.has(keyword)) {
            converted[keyword] = convertMap(value as Record<string, JSONSchema7Definition>);
        } else {
            converted[keyword] = value;
        }
    }

    return converted;
}

function convertMap(map: Record<string, JSONSchema7Definition>): Record<string, JsonSchema202012> {
    return Object.fromEntries(Object.entries(map).map(([name, subschema]) => [name, draft07ToDraft202012(subschema)]));
}
