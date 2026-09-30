import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { generateText, wrapLanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCacheMiddleware, ModelCacheMissError } from './agentPlaygroundModel.service.js';

import type { CacheMode, ModelCallStats } from './agentPlaygroundModel.service.js';

function textModel() {
    let calls = 0;
    const model = new MockLanguageModelV4({
        doGenerate: () => {
            calls += 1;
            return Promise.resolve({
                content: [{ type: 'text', text: `answer ${calls}` }],
                finishReason: { unified: 'stop', raw: undefined },
                usage: {
                    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: 5, text: 5, reasoning: undefined }
                },
                warnings: [],
                response: { timestamp: new Date('2026-09-29T10:00:00Z') }
            });
        }
    });
    return { model, calls: () => calls };
}

describe('createCacheMiddleware', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-playground-cache-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    function cached(model: MockLanguageModelV4, mode: CacheMode, stats: ModelCallStats) {
        return wrapLanguageModel({ model, middleware: createCacheMiddleware({ mode, dir, stats }) });
    }

    it('replays the same call from disk without calling the model again', async () => {
        const { model, calls } = textModel();
        const stats = { modelCalls: 0, cachedModelCalls: 0 };

        const first = await generateText({ model: cached(model, 'readwrite', stats), prompt: 'hello' });
        const second = await generateText({ model: cached(model, 'readwrite', stats), prompt: 'hello' });

        expect(calls()).toBe(1);
        expect(second.text).toBe(first.text);
        expect(second.response.timestamp).toBeInstanceOf(Date);
        expect(stats).toEqual({ modelCalls: 2, cachedModelCalls: 1 });
    });

    it('calls the model for a different prompt', async () => {
        const { model, calls } = textModel();
        const stats = { modelCalls: 0, cachedModelCalls: 0 };

        await generateText({ model: cached(model, 'readwrite', stats), prompt: 'hello' });
        await generateText({ model: cached(model, 'readwrite', stats), prompt: 'hello again' });

        expect(calls()).toBe(2);
        expect(stats.cachedModelCalls).toBe(0);
    });

    it('refuses to call the model on a miss in readonly mode', async () => {
        const { model, calls } = textModel();
        const stats = { modelCalls: 0, cachedModelCalls: 0 };

        await expect(generateText({ model: cached(model, 'readonly', stats), prompt: 'hello', maxRetries: 0 })).rejects.toBeInstanceOf(ModelCacheMissError);
        expect(calls()).toBe(0);
    });

    it('serves a stored call in readonly mode', async () => {
        const { model, calls } = textModel();
        const stats = { modelCalls: 0, cachedModelCalls: 0 };

        const stored = await generateText({ model: cached(model, 'readwrite', stats), prompt: 'hello' });
        const replayed = await generateText({ model: cached(model, 'readonly', stats), prompt: 'hello', maxRetries: 0 });

        expect(calls()).toBe(1);
        expect(replayed.text).toBe(stored.text);
    });

    it('treats a corrupt entry as a miss and stores a fresh one', async () => {
        const { model, calls } = textModel();
        const stats = { modelCalls: 0, cachedModelCalls: 0 };

        await generateText({ model: cached(model, 'readwrite', stats), prompt: 'hello' });
        const [entry] = await fs.readdir(dir);
        await fs.writeFile(path.join(dir, entry!), '{"truncated');

        await generateText({ model: cached(model, 'readwrite', stats), prompt: 'hello' });
        const replayed = await generateText({ model: cached(model, 'readwrite', stats), prompt: 'hello' });

        expect(calls()).toBe(2);
        expect(replayed.text).toBe('answer 2');
    });

    it('keeps the cache readable by its owner only', async () => {
        const { model } = textModel();
        const nested = path.join(dir, 'nested');

        await generateText({
            model: wrapLanguageModel({
                model,
                middleware: createCacheMiddleware({ mode: 'readwrite', dir: nested, stats: { modelCalls: 0, cachedModelCalls: 0 } })
            }),
            prompt: 'hello'
        });
        const [entry] = await fs.readdir(nested);

        expect((await fs.stat(nested)).mode & 0o777).toBe(0o700);
        expect((await fs.stat(path.join(nested, entry!))).mode & 0o777).toBe(0o600);
    });

    it('never reads or writes the cache when off', async () => {
        const { model, calls } = textModel();
        const stats = { modelCalls: 0, cachedModelCalls: 0 };

        await generateText({ model: cached(model, 'off', stats), prompt: 'hello' });
        await generateText({ model: cached(model, 'off', stats), prompt: 'hello' });

        expect(calls()).toBe(2);
        expect(await fs.readdir(dir)).toEqual([]);
    });
});
