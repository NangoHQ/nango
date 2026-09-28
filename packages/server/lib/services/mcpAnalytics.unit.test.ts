import { Client } from '@modelcontextprotocol/client';
import { fromJsonSchema, InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';

import { productTracking } from '@nangohq/shared';

import { trackMcpServer } from './mcpAnalytics.js';

describe('trackMcpServer', () => {
    it.each(['oauth', 'apiKey'] as const)('captures management usage for %s without changing tool schemas or sending tool data', async (authType) => {
        const originalClient = productTracking.client;
        const captures: { event: string; distinctId: string; properties: Record<string, unknown>; groups?: Record<string, string> }[] = [];
        const capture = vi.fn((event: (typeof captures)[number]) => {
            captures.push(event);
        });
        const groupIdentify = vi.fn();
        productTracking.identifiedAccountNames.clear();
        productTracking.client = { capture, groupIdentify } as unknown as typeof productTracking.client;
        const server = new McpServer({ name: 'Nango Management MCP server', version: '1.0.0' });
        const inputSchema = fromJsonSchema({
            type: 'object',
            properties: { secret: { type: 'string' }, ...(authType === 'oauth' ? { environment: { type: 'string' } } : {}) },
            required: authType === 'oauth' ? ['secret', 'environment'] : ['secret'],
            additionalProperties: false
        });
        server.registerTool('example', { inputSchema }, (args: unknown) => ({ content: [{ type: 'text', text: (args as { secret: string }).secret }] }));
        server.registerTool('failing', { inputSchema }, () => {
            throw new Error('private-failure customer-secret');
        });
        trackMcpServer({
            server,
            mcpType: 'management',
            account: { id: 42, name: 'Acme' },
            authType,
            ...(authType === 'apiKey' ? { environment: { is_production: true } } : { environments: [{ name: 'prod', is_production: true }] })
        });

        const client = new Client({ name: 'test-client', version: '1.0.0' });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

        try {
            await server.connect(serverTransport);
            await client.connect(clientTransport);

            const tools = await client.listTools();
            const exampleTool = tools.tools.find((tool) => tool.name === 'example');
            expect(exampleTool?.inputSchema).toMatchObject({
                properties: { secret: { type: 'string' } },
                required: authType === 'oauth' ? ['secret', 'environment'] : ['secret']
            });
            expect(Object.keys(exampleTool?.inputSchema.properties ?? {})).toStrictEqual(authType === 'oauth' ? ['secret', 'environment'] : ['secret']);

            const result = await client.callTool({
                name: 'example',
                arguments: { secret: 'customer-secret', ...(authType === 'oauth' ? { environment: 'prod' } : {}) }
            });
            expect(result.content).toStrictEqual([{ type: 'text', text: 'customer-secret' }]);

            await vi.waitFor(() => expect(capture).toHaveBeenCalledWith(expect.objectContaining({ event: '$mcp_tool_call' })));
            const toolCall = captures.find((event) => event.event === '$mcp_tool_call' && event.properties['$mcp_tool_name'] === 'example');
            expect(toolCall).toMatchObject({
                distinctId: 'account-42',
                groups: { company: '42' },
                properties: {
                    mcp_type: 'management',
                    mcp_auth_type: authType,
                    surface: 'server',
                    is_production: true,
                    $process_person_profile: false,
                    $mcp_server_name: 'Nango Management MCP server',
                    $mcp_tool_name: 'example',
                    $mcp_is_error: false
                }
            });
            expect(toolCall?.properties).not.toHaveProperty('$mcp_parameters');
            expect(toolCall?.properties).not.toHaveProperty('$mcp_response');
            expect(groupIdentify).toHaveBeenCalledWith({ groupType: 'company', groupKey: '42', properties: { name: 'Acme' } });

            const failedResult = await client.callTool({
                name: 'failing',
                arguments: { secret: 'customer-secret', ...(authType === 'oauth' ? { environment: 'prod' } : {}) }
            });
            expect(failedResult.isError).toBe(true);
            await vi.waitFor(() =>
                expect(captures.some((event) => event.event === '$mcp_tool_call' && event.properties['$mcp_tool_name'] === 'failing')).toBe(true)
            );
            const failedCall = captures.find((event) => event.event === '$mcp_tool_call' && event.properties['$mcp_tool_name'] === 'failing');
            expect(failedCall?.properties).toMatchObject({ $mcp_is_error: true });
            expect(failedCall?.properties).not.toHaveProperty('$mcp_parameters');
            expect(failedCall?.properties).not.toHaveProperty('$mcp_response');
            expect(failedCall?.properties).not.toHaveProperty('$mcp_error_message');
            expect(JSON.stringify(captures)).not.toContain('customer-secret');
            expect(JSON.stringify(captures)).not.toContain('private-failure');
            expect(captures.some((event) => event.event === '$exception')).toBe(false);
        } finally {
            await client.close();
            await server.close();
            productTracking.client = originalClient;
        }
    });
});
