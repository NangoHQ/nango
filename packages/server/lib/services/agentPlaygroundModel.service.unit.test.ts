import { generateText, streamText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlaygroundModel } from './agentPlaygroundModel.service.js';
import { modelErrorCategory } from './agentPlaygroundModelError.js';

import type * as Utils from '@nangohq/utils';

const runtime = vi.hoisted(() => ({
    envs: { OPENAI_API_KEY: 'sk-test' as string | undefined, NANGO_AGENT_PLAYGROUND_MODEL: 'gpt-test' },
    isDocker: false
}));

vi.mock('../env.js', () => ({ envs: runtime.envs }));
vi.mock('@nangohq/utils', async (importOriginal) => {
    const original = await importOriginal<typeof Utils>();
    return {
        ...original,
        get isDocker() {
            return runtime.isDocker;
        }
    };
});

describe('createPlaygroundModel', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        runtime.envs.OPENAI_API_KEY = 'sk-test';
        runtime.isDocker = false;
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

    it('fails every turn as a missing key on a deployed server without a key', async () => {
        runtime.envs.OPENAI_API_KEY = undefined;
        runtime.isDocker = true;

        let received: unknown;
        const result = streamText({ model: createPlaygroundModel(), prompt: 'Hi', onError: ({ error }) => void (received = error) });
        await result.consumeStream();

        expect(modelErrorCategory(received)).toBe('missing_key');
    });

    it('answers with the mock model locally without a key', async () => {
        runtime.envs.OPENAI_API_KEY = undefined;

        const result = await generateText({ model: createPlaygroundModel(), prompt: 'Hi' });

        expect(result.response.modelId).toBe('mock');
    });
});
