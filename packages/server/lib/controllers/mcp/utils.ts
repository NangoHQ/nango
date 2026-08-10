import { getLogger } from '@nangohq/utils';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const logger = getLogger('Server.MCP');

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
