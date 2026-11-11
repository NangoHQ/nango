import * as z from 'zod/v4';

import { goalSchema, intentSchema } from './purposeSchema.js';

import type { Tool } from '@modelcontextprotocol/server';

const purposeSchema = z.object({ goal: goalSchema, intent: intentSchema }).strict();

/**
 * A directly called tool takes its input wrapped next to the goal and the intent, the same shape
 * nango_execute takes, so our fields never clash with one of the tool's own and any input root works.
 */
export const directCallSchema = purposeSchema.extend({ input: z.json().optional() });

const PURPOSE_JSON_SCHEMA = z.toJSONSchema(purposeSchema, { io: 'input' });

const ANY_INPUT = { description: 'The input to pass to the tool.' };

const HOISTED_REF = /^#\/(\$defs|definitions)(\/|$)/;
const NON_SCHEMA_KEYWORDS = new Set(['const', 'enum', 'default', 'examples']);
const NAMED_SCHEMAS_KEYWORDS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas', 'dependencies']);

/**
 * What tools/list advertises for a tool, from the schema of its own input: `none` for a tool that
 * takes no input, `undefined` when that schema is unknown, so any input is accepted.
 */
export function directCallInputSchema(toolInput: Record<string, unknown> | 'none' | undefined): Tool['inputSchema'] {
    if (toolInput === 'none') {
        return PURPOSE_JSON_SCHEMA as Tool['inputSchema'];
    }

    const {
        $schema = PURPOSE_JSON_SCHEMA.$schema,
        $id: _id,
        $defs,
        definitions,
        ...input
    } = toolInput === undefined ? {} : (rebaseLocalRefs(toolInput) as Record<string, unknown>);

    return {
        ...PURPOSE_JSON_SCHEMA,
        $schema,
        properties: { input: toolInput ? input : ANY_INPUT, ...PURPOSE_JSON_SCHEMA.properties },
        required: toolInput ? ['input', ...(PURPOSE_JSON_SCHEMA.required ?? [])] : PURPOSE_JSON_SCHEMA.required,
        ...($defs === undefined ? {} : { $defs }),
        ...(definitions === undefined ? {} : { definitions })
    } as Tool['inputSchema'];
}

/**
 * Nesting the tool schema under `input` moves its root, so its local refs are pointed at the new one,
 * except refs into its definitions, which stay at the root.
 */
function rebaseLocalRefs(schema: unknown): unknown {
    if (Array.isArray(schema)) {
        return schema.map((item) => rebaseLocalRefs(item));
    }
    if (typeof schema !== 'object' || schema === null) {
        return schema;
    }

    return Object.fromEntries(
        Object.entries(schema).map(([key, value]) => {
            if (key === '$ref' && typeof value === 'string' && (value === '#' || value.startsWith('#/')) && !HOISTED_REF.test(value)) {
                return [key, `#/properties/input${value.slice(1)}`];
            }
            if (NON_SCHEMA_KEYWORDS.has(key)) {
                return [key, value];
            }
            return [key, NAMED_SCHEMAS_KEYWORDS.has(key) ? rebaseNamedSchemas(value) : rebaseLocalRefs(value)];
        })
    );
}

/** The keys of a map like `properties` are names the tool chose, so none of them is a keyword. */
function rebaseNamedSchemas(schemas: unknown): unknown {
    if (typeof schemas !== 'object' || schemas === null || Array.isArray(schemas)) {
        return rebaseLocalRefs(schemas);
    }
    return Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, rebaseLocalRefs(schema)]));
}
