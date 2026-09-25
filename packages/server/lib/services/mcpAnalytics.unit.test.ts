import { Client } from '@modelcontextprotocol/client';
import { fromJsonSchema, InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';

import { trackMcpServer } from './mcpAnalytics.js';

import type { PostHog } from 'posthog-node';

describe('trackMcpServer', () => {
    it.each(['oauth', 'apiKey'] as const)('captures management usage for %s without changing tool schemas or sending tool data', async (authType) => {
        const captures: Parameters<PostHog['capture']>[0][] = [];
        const capture = vi.fn((event: Parameters<PostHog['capture']>[0]) => {
            captures.push(event);
        });
        const posthogClient = { capture } as unknown as PostHog;
        const server = new McpServer({ name: 'Nango Management MCP server', version: '1.0.0' });
        server.registerTool(
            'example',
            {
                inputSchema: fromJsonSchema({
                    type: 'object',
                    properties: { secret: { type: 'string' } },
                    required: ['secret'],
                    additionalProperties: false
                })
            },
            (args: unknown) => ({ content: [{ type: 'text', text: (args as { secret: string }).secret }] })
        );
        trackMcpServer({ server, mcpType: 'management', accountId: 42, authType, posthogClient });

        const client = new Client({ name: 'test-client', version: '1.0.0' });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

        try {
            await server.connect(serverTransport);
            await client.connect(clientTransport);

            const tools = await client.listTools();
            expect(tools.tools[0]?.inputSchema).toMatchObject({
                properties: { secret: { type: 'string' } },
                required: ['secret']
            });
            expect(Object.keys(tools.tools[0]?.inputSchema.properties ?? {})).toStrictEqual(['secret']);

            const result = await client.callTool({ name: 'example', arguments: { secret: 'customer-secret' } });
            expect(result.content).toStrictEqual([{ type: 'text', text: 'customer-secret' }]);

            await vi.waitFor(() => expect(capture).toHaveBeenCalledWith(expect.objectContaining({ event: '$mcp_tool_call' })));
            const toolCall = captures.find((event) => event.event === '$mcp_tool_call');
            expect(toolCall).toMatchObject({
                properties: {
                    'mcp-type': 'management',
                    'mcp-auth-type': authType,
                    'team-id': 42,
                    'account-id': 42,
                    $mcp_server_name: 'Nango Management MCP server',
                    $mcp_tool_name: 'example',
                    $mcp_is_error: false
                }
            });
            expect(toolCall?.properties).not.toHaveProperty('$mcp_parameters');
            expect(toolCall?.properties).not.toHaveProperty('$mcp_response');
            expect(JSON.stringify(captures)).not.toContain('customer-secret');
        } finally {
            await client.close();
            await server.close();
        }
    });
});
