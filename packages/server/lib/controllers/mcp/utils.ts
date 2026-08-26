import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import * as z from 'zod/v4';

import { getLogger } from '@nangohq/utils';

import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

const logger = getLogger('Server.MCP');

const jsonSchema202012 = 'https://json-schema.org/draft/2020-12/schema';

export const emptyObjectJsonSchema: Tool['inputSchema'] = { $schema: jsonSchema202012, type: 'object', properties: {} };

export class PublicMcpError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PublicMcpError';
    }
}

export class InternalMcpError extends Error {
    public readonly status = 500;

    constructor() {
        super('Internal error');
        this.name = 'InternalMcpError';
    }
}

export function jsonContent(data: unknown): CallToolResult {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(data, null, 2)
            }
        ]
    };
}

export function jsonStructuredContent(data: object): CallToolResult {
    return {
        ...jsonContent(data),
        structuredContent: data as { [key: string]: unknown }
    };
}

export function mcpToolError(message: string): CallToolResult {
    return {
        content: [{ type: 'text', text: message }],
        isError: true
    };
}

/**
 * MCP SDK 1.30 defaults Zod v4 conversion to draft-07 and does not expose a target option through
 * registerTool, so every server that lists tools converts its schemas itself.
 * TODO(NAN-6651): Remove once the MCP SDK emits JSON Schema 2020-12.
 */
export function toJsonSchema202012(schema: AnySchema | z.ZodType, io: 'input' | 'output'): Tool['inputSchema'] | undefined {
    const objectSchema = normalizeObjectSchema(schema);
    if (!objectSchema) {
        return undefined;
    }

    const jsonSchema = z.toJSONSchema(objectSchema as z.ZodType, { target: 'draft-2020-12', io });
    if (jsonSchema.type !== 'object' || jsonSchema.$schema !== jsonSchema202012) {
        throw new Error(`Failed to generate a JSON Schema 2020-12 object for an MCP tool ${io} schema`);
    }

    return jsonSchema as Tool['inputSchema'];
}

export function formatMcpArgumentsError(toolName: string, error: z.ZodError): string {
    const details = error.issues
        .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'arguments';
            return `${path}: ${issue.message}`;
        })
        .join('; ');

    return details ? `Invalid ${toolName} arguments: ${details}` : `Invalid ${toolName} arguments`;
}

export function handleMcpToolError(err: unknown, toolName: string): CallToolResult {
    if (err instanceof PublicMcpError) {
        return mcpToolError(err.message);
    }

    if (err instanceof InternalMcpError) {
        return mcpToolError(err.message);
    }

    logger.error('MCP tool handler failed', { err, toolName });
    return mcpToolError('Internal error');
}
