import * as z from 'zod/v4';

import { getLogger } from '@nangohq/utils';

import type { CallToolResult, JsonSchemaType, Tool } from '@modelcontextprotocol/server';
import type { NangoError } from '@nangohq/shared';

const logger = getLogger('Server.MCP');

const jsonSchema202012 = 'https://json-schema.org/draft/2020-12/schema';

export interface McpErrorContext {
    code?: string | undefined;
    integrationId?: string | undefined;
}

export class PublicMcpError extends Error {
    public readonly code: string | undefined;
    public readonly integrationId: string | undefined;

    constructor(message: string, context: McpErrorContext = {}) {
        super(message);
        this.name = 'PublicMcpError';
        this.code = context.code;
        this.integrationId = context.integrationId;
    }
}

export class InternalMcpError extends Error {
    public readonly status = 500;

    constructor() {
        super('Internal error');
        this.name = 'InternalMcpError';
    }
}

const MAX_FAILURE_DETAIL_LENGTH = 500;

export function safeFailureDetail(error: NangoError): string {
    const detail = error.payload && typeof error.payload === 'object' ? error.payload['error'] : undefined;

    const reason =
        typeof detail === 'string'
            ? detail
            : detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string'
              ? detail.message
              : undefined;

    if (!reason || error.message.includes(reason)) {
        return error.message;
    }

    return `${error.message}: ${reason.slice(0, MAX_FAILURE_DETAIL_LENGTH)}`;
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

export function mcpToolError(message: string, context: McpErrorContext = {}): CallToolResult {
    const { code, integrationId } = context;

    const meta = {
        ...(code ? { 'nango/error_code': code } : {}),
        ...(integrationId ? { 'nango/integration_id': integrationId } : {})
    };

    return {
        content: [{ type: 'text', text: message }],
        isError: true,
        ...(Object.keys(meta).length > 0 ? { _meta: meta } : {})
    };
}

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
