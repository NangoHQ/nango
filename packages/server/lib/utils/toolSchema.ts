import * as z from 'zod/v4';

import type { JsonSchemaType, Tool } from '@modelcontextprotocol/server';

const jsonSchema202012 = 'https://json-schema.org/draft/2020-12/schema';

/**
 * MCP v2 can consume Zod schemas directly starting with Zod 4.2. Nango's Zod schemas
 * cross workspace boundaries on 4.0, so convert them before wrapping them with the SDK's
 * fromJsonSchema() instead of introducing incompatible Zod types.
 * TODO(NAN-6651): Remove after upgrading the workspace to Zod 4.2 and passing Zod schemas directly.
 */
export function toJsonSchema202012(schema: z.ZodType, io: 'input' | 'output'): Tool['inputSchema'] & JsonSchemaType {
    const jsonSchema = z.toJSONSchema(schema, { target: 'draft-2020-12', io });
    if (jsonSchema.type !== 'object' || jsonSchema.$schema !== jsonSchema202012) {
        throw new Error(`Failed to generate a JSON Schema 2020-12 object for an MCP tool ${io} schema`);
    }

    return jsonSchema as unknown as Tool['inputSchema'] & JsonSchemaType;
}
