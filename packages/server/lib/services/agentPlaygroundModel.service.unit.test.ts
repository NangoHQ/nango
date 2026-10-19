import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlaygroundModel } from './agentPlaygroundModel.service.js';

vi.mock('../env.js', () => ({ envs: { OPENAI_API_KEY: 'sk-test', NANGO_AGENT_PLAYGROUND_MODEL: 'gpt-test' } }));

describe('createPlaygroundModel', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends a stopped turn back without referring to its unsaved reasoning', async () => {
        const requests: Record<string, unknown>[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn((_url: string, init: { body: string }) => {
                requests.push(JSON.parse(init.body) as Record<string, unknown>);
                return Promise.reject(new Error('stop after the request'));
            })
        );

        await generateText({
            model: createPlaygroundModel(),
            maxRetries: 0,
            messages: [
                { role: 'user', content: 'List my repositories' },
                { role: 'assistant', content: [{ type: 'reasoning', text: '', providerOptions: { openai: { itemId: 'rs_stopped' } } }] },
                { role: 'user', content: 'hello?' }
            ]
        }).catch(() => undefined);

        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ store: false });
        expect(JSON.stringify(requests[0]?.['input'])).not.toContain('rs_stopped');
    });
});
