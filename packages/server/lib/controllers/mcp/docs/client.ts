import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

import { Err, getLogger, Ok } from '@nangohq/utils';

import { PublicMcpError } from '../utils.js';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Server.ManagementMcp.DocsClient');
const docsMcpUrl = new URL('https://nango.dev/docs/mcp');
const docsMcpTimeoutMs = 60_000;
const docsMcpDirectAccessMessage = `Connect to the Nango documentation MCP directly at ${docsMcpUrl.toString()}`;

export type DocsMcpToolName = 'search_nango_docs' | 'query_docs_filesystem_nango_docs';

export interface ConnectedDocsMcpClient {
    callTool(name: DocsMcpToolName, args: Record<string, unknown>, signal: AbortSignal): Promise<CallToolResult>;
    close: () => Promise<void>;
}

export type ConnectDocsMcpClient = (signal: AbortSignal) => Promise<ConnectedDocsMcpClient>;

export class DocsMcpClient {
    constructor(private readonly connect: ConnectDocsMcpClient = connectDocsMcpClient) {}

    async callTool(name: DocsMcpToolName, args: Record<string, unknown>): Promise<Result<string[]>> {
        const signal = AbortSignal.timeout(docsMcpTimeoutMs);
        let client: ConnectedDocsMcpClient | undefined;

        try {
            client = await this.connect(signal);
            const result = await client.callTool(name, args, signal);
            const textContent = result.content.filter((content) => content.type === 'text').map((content) => content.text);

            if (result.isError) {
                const message = textContent.join('\n').trim();
                if (isRateLimitError(message)) {
                    return Err(rateLimitError());
                }

                return Err(new PublicMcpError(message || 'The Nango documentation request failed.'));
            }

            return Ok(textContent);
        } catch (err) {
            if (isRateLimitError(err)) {
                return Err(rateLimitError());
            }

            logger.error('Nango documentation MCP request failed', { err, toolName: name });
            return Err(new PublicMcpError('The Nango documentation service is temporarily unavailable.'));
        } finally {
            if (client) {
                try {
                    await client.close();
                } catch (err) {
                    logger.error('Failed to close Nango documentation MCP client', { err, toolName: name });
                }
            }
        }
    }
}

export const docsMcpClient = new DocsMcpClient();

async function connectDocsMcpClient(signal: AbortSignal): Promise<ConnectedDocsMcpClient> {
    const client = new Client({ name: 'Nango Management MCP docs proxy', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(docsMcpUrl);
    await client.connect(transport as Transport, { signal, timeout: docsMcpTimeoutMs, maxTotalTimeout: docsMcpTimeoutMs });

    return {
        async callTool(name, args, callSignal) {
            return (await client.callTool({ name, arguments: args }, CallToolResultSchema, {
                signal: callSignal,
                timeout: docsMcpTimeoutMs,
                maxTotalTimeout: docsMcpTimeoutMs
            })) as CallToolResult;
        },
        async close() {
            await client.close();
        }
    };
}

function isRateLimitError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 429) {
        return true;
    }

    const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
    return /\b429\b|rate[ -]?limit|too many requests/i.test(message);
}

function rateLimitError(): PublicMcpError {
    return new PublicMcpError(`The Nango documentation MCP returned 429 Too Many Requests. ${docsMcpDirectAccessMessage}.`);
}
