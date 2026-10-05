import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlaygroundModel } from './agentPlaygroundModel.service.js';

vi.mock('../env.js', () => ({ envs: { OPENAI_API_KEY: 'sk-test', NANGO_AGENT_PLAYGROUND_MODEL: 'gpt-test' } }));

describe('createPlaygroundModel', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('asks OpenAI not to store the response', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}', { status: 500 }));
        vi.stubGlobal('fetch', fetch);

        await generateText({ model: createPlaygroundModel(), prompt: 'hi', maxRetries: 0 }).catch(() => undefined);

        expect(fetch).toHaveBeenCalledOnce();
        const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as { store?: boolean };
        expect(body.store).toBe(false);
    });
});
