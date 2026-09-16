import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

import { createManagementMcpOAuthServer } from './managementOAuthServer.js';

import type { McpServer } from '@modelcontextprotocol/server';
import type { DBTeam } from '@nangohq/types';

describe('createManagementMcpOAuthServer', () => {
    it('exposes only environments_list with a strict empty input schema', async () => {
        const { client, server } = await createTestClient();

        try {
            const result = await client.listTools();

            expect(result.tools).toHaveLength(1);
            expect(result.tools[0]).toMatchObject({
                name: 'environments_list',
                annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
                inputSchema: {
                    type: 'object',
                    properties: {},
                    additionalProperties: false
                },
                outputSchema: {
                    type: 'object',
                    required: ['environments'],
                    additionalProperties: false
                }
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('returns only environment names and production flags', async () => {
        const { client, server } = await createTestClient();

        try {
            const result = await client.callTool({ name: 'environments_list', arguments: {} });
            const expected = {
                environments: [
                    { name: 'dev', is_production: false },
                    { name: 'prod', is_production: true }
                ]
            };

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(expected, null, 2) }],
                structuredContent: expected
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('rejects unexpected input properties', async () => {
        const { client, server } = await createTestClient();

        try {
            const result = await client.callTool({ name: 'environments_list', arguments: { environment: 'dev' } });
            expect(result.isError).toBe(true);
            expect(result.content[0]).toMatchObject({ type: 'text' });
            expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('Invalid arguments for tool environments_list');
        } finally {
            await client.close();
            await server.close();
        }
    });
});

async function createTestClient(): Promise<{ client: Client; server: McpServer }> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createManagementMcpOAuthServer({
        account: fakeAccount(),
        environments: [
            { id: 1, name: 'dev', is_production: false },
            { id: 2, name: 'prod', is_production: true }
        ]
    });
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    return { client, server };
}

function fakeAccount(): DBTeam {
    const now = new Date();
    return {
        id: 1,
        name: 'Test Account',
        uuid: 'test-account',
        found_us: null,
        created_at: now,
        updated_at: now
    };
}
