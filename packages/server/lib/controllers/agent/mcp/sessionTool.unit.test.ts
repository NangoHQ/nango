import { describe, expect, it } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../../mcp/utils.js';
import { callAgentSessionTool } from './sessionTool.js';

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

    it('passes a public error back to the agent', async () => {
        const result = await call(() => Promise.resolve(Err(new PublicMcpError('the doc is locked'))));

        expect(result.isError).toBe(true);
        expect(result.content[0]).toStrictEqual({ type: 'text', text: 'the doc is locked' });
    });

    it('hides an internal error from the agent', async () => {
        const result = await call(() => Promise.resolve(Err(new InternalMcpError())));

        expect(result.isError).toBe(true);
        expect(result.content[0]).toStrictEqual({ type: 'text', text: 'Internal error' });
    });

    it('turns a thrown error into a tool result rather than letting it escape', async () => {
        const result = await call(() => Promise.reject(new Error('boom')));

        expect(result.isError).toBe(true);
        expect(result.content[0]).toStrictEqual({ type: 'text', text: 'Internal error' });
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
        const result = await callStructured(() => Promise.resolve(Err(new PublicMcpError('nope'))));

        expect(result.isError).toBe(true);
        expect(result.structuredContent).toBeUndefined();
    });
});
