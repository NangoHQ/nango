import { afterEach, describe, expect, it, vi } from 'vitest';

import { productTracking, withProductTrackingContext } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { trackAgentSessionToolCall } from '../../../services/agentSessionAnalytics.service.js';
import { InternalMcpError, PublicMcpError } from '../../mcp/utils.js';
import { callAgentSessionTool, RemoteToolResult } from './sessionTool.js';

import type { AgentSession, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

async function call(run: () => Promise<Result<unknown>>) {
    return await callAgentSessionTool({ metric: 'nango_execute', accountId: 1, run });
}

async function callStructured(run: () => Promise<Result<unknown>>) {
    return await callAgentSessionTool({ metric: 'nango_tool_search', accountId: 1, structured: true, run });
}

describe('callAgentSessionTool', () => {
    it('renders a result as json', async () => {
        const result = await call(() => Promise.resolve(Ok({ ok: true })));

        expect(result.isError).toBeUndefined();
        expect(result.content[0]).toStrictEqual({ type: 'text', text: JSON.stringify({ ok: true }, null, 2) });
    });

    // JSON.stringify(undefined) is undefined, not a string, so this would render an invalid content block.
    it('renders a tool that returns nothing as null rather than an empty text block', async () => {
        const result = await call(() => Promise.resolve(Ok(undefined)));

        expect(result.content[0]).toStrictEqual({ type: 'text', text: 'null' });
    });

    it('passes a public error back to the agent, with the code and integration it branches on', async () => {
        const result = await call(() => Promise.resolve(Err(new PublicMcpError('the doc is locked', { code: 'tool_failed', integrationId: 'notion' }))));

        expect(result.isError).toBe(true);
        expect(result.content[0]).toStrictEqual({ type: 'text', text: 'the doc is locked' });
        expect(result._meta).toStrictEqual({ 'nango/error_code': 'tool_failed', 'nango/integration_id': 'notion' });
    });

    it('leaves the code off an error that carries none', async () => {
        const result = await call(() => Promise.resolve(Err(new PublicMcpError('the doc is locked'))));

        expect(result.isError).toBe(true);
        expect(result._meta).toBeUndefined();
    });

    it('says a Nango-side failure in words the agent can act on, without saying what broke', async () => {
        const result = await call(() => Promise.resolve(Err(new InternalMcpError())));

        expect(result.isError).toBe(true);
        expect(result.content[0]).toStrictEqual({
            type: 'text',
            text: 'The tool could not be run. Trying once more is reasonable, and tell the user if it keeps failing.'
        });
        expect(result._meta).toStrictEqual({ 'nango/error_code': 'internal_error' });
    });

    it('turns a thrown error into a tool result rather than letting it escape', async () => {
        const result = await call(() => Promise.reject(new Error('boom')));

        expect(result.isError).toBe(true);
        expect(result.content[0]?.type).toBe('text');
        expect(result._meta).toStrictEqual({ 'nango/error_code': 'internal_error' });
    });
});

describe('callAgentSessionTool in structured mode', () => {
    it('renders an object as structured content as well as text', async () => {
        const result = await callStructured(() => Promise.resolve(Ok({ matches: [] })));

        expect(result.structuredContent).toStrictEqual({ matches: [] });
        expect(result.content[0]).toStrictEqual({ type: 'text', text: JSON.stringify({ matches: [] }, null, 2) });
    });

    /**
     * structuredContent has to be a JSON object. jsonStructuredContent is typed for one but checks
     * nothing, so anything else has to fall back rather than render a result its own schema rejects.
     */
    it('falls back to plain content for anything that is not a JSON object', async () => {
        for (const value of [undefined, null, [1, 2], 'text', 7, true]) {
            const result = await callStructured(() => Promise.resolve(Ok(value)));

            expect(result.structuredContent).toBeUndefined();
            expect(result.content[0]).toMatchObject({ type: 'text' });
        }
    });

    it('still reports an error as an error', async () => {
        const result = await callStructured(() => Promise.resolve(Err(new PublicMcpError('nope', { code: 'tool_failed' }))));

        expect(result.isError).toBe(true);
        expect(result.structuredContent).toBeUndefined();
        expect(result._meta).toStrictEqual({ 'nango/error_code': 'tool_failed' });
    });
});

describe('callAgentSessionTool with an MCP server tool', () => {
    it('returns the result the server gave, error results included', async () => {
        const result = { content: [{ type: 'text' as const, text: 'Unknown team' }], isError: true };

        expect(await callAgentSessionTool({ metric: 'integration_tool', accountId: 1, run: () => Promise.resolve(Ok(new RemoteToolResult(result))) })).toBe(
            result
        );
    });
});

describe('callAgentSessionTool analytics', () => {
    const capture = vi.fn<(payload: { event: string; properties: Record<string, unknown> }) => void>();
    const realClient = productTracking.client;
    const session = { id: 'session-1', metaTools: { nangoCreateConnection: { enabled: false, tags: {} } } } as unknown as AgentSession;

    afterEach(() => {
        capture.mockClear();
        productTracking.client = realClient;
    });

    it('sizes a tool call event by the text the agent receives', async () => {
        productTracking.client = { capture } as unknown as typeof productTracking.client;
        const data = { title: 'Roadmap', body: 'ünïcode' };

        const result = await withProductTrackingContext(
            () => ({ team: { id: 42 } as DBTeam }),
            async () =>
                await call(() => {
                    trackAgentSessionToolCall({ session, integrationId: 'notion', toolName: 'read_doc' });
                    return Promise.resolve(Ok(data));
                })
        );

        const bytes = Buffer.byteLength(JSON.stringify(data, null, 2));
        expect(result.content[0]).toStrictEqual({ type: 'text', text: JSON.stringify(data, null, 2) });
        expect(capture).toHaveBeenCalledTimes(1);
        const [payload] = capture.mock.calls[0] ?? [];
        expect(payload?.properties).toMatchObject({ result_size_bytes: bytes, result_token_estimate: Math.ceil(bytes / 4) });
        expect(typeof payload?.properties['call_duration_ms']).toBe('number');
    });
});
