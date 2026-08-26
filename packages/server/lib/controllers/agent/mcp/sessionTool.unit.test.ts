import { describe, expect, it } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../../mcp/utils.js';
import { callAgentSessionTool } from './sessionTool.js';

import type { Result } from '@nangohq/utils';

async function call(run: () => Promise<Result<unknown>>) {
    return await callAgentSessionTool({ metric: 'nango_execute', accountId: 1, run });
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
