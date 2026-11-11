import * as z from 'zod/v4';

import { goalSchema, intentSchema } from './purposeSchema.js';

import type { Tool } from '@modelcontextprotocol/server';

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

const HOISTED_REF = /^#\/(\$defs|definitions)(\/|$)/;
const NON_SCHEMA_KEYWORDS = new Set(['const', 'enum', 'default', 'examples']);

/**
 * A directly called tool takes its input wrapped next to the goal and the intent, the same shape
 * nango_execute takes, so our fields never clash with one of the tool's own and any input root works.
 */
export const directCallSchema = z
    .object({
        input: z.json().optional(),
        goal: goalSchema,
        intent: intentSchema
    })
    .strict();

const PURPOSE_PROPERTIES = z.toJSONSchema(z.object({ goal: goalSchema, intent: intentSchema }), { io: 'input' }).properties;

/**
 * What tools/list advertises for a tool, from the schema of its own input: `none` for a tool that
 * takes no input, `undefined` when that schema is unknown, so any input is accepted.
 */
export function directCallInputSchema(toolInput: Record<string, unknown> | 'none' | undefined): Tool['inputSchema'] {
    if (toolInput === 'none') {
        return wrapper({ properties: {}, required: [] });
    }

    if (toolInput === undefined) {
        return wrapper({ properties: { input: { description: 'The input to pass to the tool.' } }, required: [] });
    }

    const { $schema, $id: _id, $defs, definitions, ...input } = rebaseLocalRefs(toolInput) as Record<string, unknown>;
    return wrapper({
        $schema: typeof $schema === 'string' ? $schema : JSON_SCHEMA_2020_12,
        properties: { input },
        required: ['input'],
        ...($defs === undefined ? {} : { $defs }),
        ...(definitions === undefined ? {} : { definitions })
    });
}

/**
 * Nesting the tool schema under `input` moves its root, so its local refs are pointed at the new one,
 * except refs into its definitions, which stay at the root.
 */
function rebaseLocalRefs(schema: unknown): unknown {
    if (Array.isArray(schema)) {
        return schema.map(rebaseLocalRefs);
    }
    if (typeof schema !== 'object' || schema === null) {
        return schema;
    }

    return Object.fromEntries(
        Object.entries(schema).map(([key, value]) => {
            if (key === '$ref' && typeof value === 'string' && (value === '#' || value.startsWith('#/')) && !HOISTED_REF.test(value)) {
                return [key, `#/properties/input${value.slice(1)}`];
            }
            return [key, NON_SCHEMA_KEYWORDS.has(key) ? value : rebaseLocalRefs(value)];
        })
    );
}

function wrapper({
    $schema = JSON_SCHEMA_2020_12,
    properties,
    required,
    ...rest
}: {
    $schema?: string;
    properties: Record<string, unknown>;
    required: string[];
    $defs?: unknown;
    definitions?: unknown;
}): Tool['inputSchema'] {
    return {
        $schema,
        type: 'object',
        properties: { ...properties, ...PURPOSE_PROPERTIES },
        required: [...required, 'goal', 'intent'],
        additionalProperties: false,
        ...rest
    } as Tool['inputSchema'];
}
