import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import { getLogger } from '@nangohq/utils';

import { envs } from '../env.js';

import type { LanguageModel, LanguageModelMiddleware } from 'ai';

const logger = getLogger('AgentPlayground.Model');

type WrapGenerate = NonNullable<LanguageModelMiddleware['wrapGenerate']>;
type GenerateResult = Awaited<ReturnType<Parameters<WrapGenerate>[0]['doGenerate']>>;
type GenerateParams = Parameters<WrapGenerate>[0]['params'];

export type CacheMode = 'off' | 'readwrite' | 'readonly';

export interface ModelCallStats {
    modelCalls: number;
    cachedModelCalls: number;
}

export class ModelCacheMissError extends Error {
    constructor(key: string) {
        super(`No cached model response for ${key} and NANGO_AGENT_PLAYGROUND_CACHE is readonly`);
        this.name = 'ModelCacheMissError';
    }
}

export function cacheKey(modelId: string, params: GenerateParams): string {
    const { abortSignal: _abortSignal, headers: _headers, ...keyed } = params;
    return crypto
        .createHash('sha256')
        .update(JSON.stringify({ modelId, params: keyed }))
        .digest('hex');
}

export function createCacheMiddleware({ mode, dir, stats }: { mode: CacheMode; dir: string; stats: ModelCallStats }): LanguageModelMiddleware {
    return {
        specificationVersion: 'v4',
        wrapGenerate: async ({ doGenerate, params, model }) => {
            stats.modelCalls += 1;
            if (mode === 'off') {
                return await doGenerate();
            }

            const key = cacheKey(model.modelId, params);
            const file = path.join(dir, `${key}.json`);

            const cached = await readCached(file);
            if (cached) {
                stats.cachedModelCalls += 1;
                logger.info(`Model cache hit ${key}`);
                return cached;
            }

            if (mode === 'readonly') {
                throw new ModelCacheMissError(key);
            }

            const result = await doGenerate();
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(file, JSON.stringify(result));
            logger.info(`Model cache miss ${key}, stored`);
            return result;
        }
    };
}

async function readCached(file: string): Promise<GenerateResult | null> {
    let raw: string;
    try {
        raw = await fs.readFile(file, 'utf8');
    } catch {
        return null;
    }

    const cached = JSON.parse(raw) as GenerateResult;
    const timestamp = cached.response?.timestamp;
    return timestamp ? { ...cached, response: { ...cached.response, timestamp: new Date(timestamp) } } : cached;
}

// Keep the real nango_tool_search call: mock mode is how the tool path gets exercised for free.
export function createMockModel(): MockLanguageModelV4 {
    const usage = {
        inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 0, text: 0, reasoning: undefined }
    };

    return new MockLanguageModelV4({
        modelId: 'mock',
        doGenerate: ({ prompt }) => {
            const last = prompt.at(-1);

            if (last?.role === 'tool') {
                const output = last.content.find((part) => part.type === 'tool-result')?.output;
                return Promise.resolve({
                    content: [{ type: 'text', text: `Mock reply. The tool returned:\n\n${JSON.stringify(output, null, 2)}` }],
                    finishReason: { unified: 'stop', raw: undefined },
                    usage,
                    warnings: []
                });
            }

            const text =
                last?.role === 'user'
                    ? last.content
                          .filter((part) => part.type === 'text')
                          .map((part) => part.text)
                          .join(' ')
                    : '';
            return Promise.resolve({
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: crypto.randomUUID(),
                        toolName: 'nango_tool_search',
                        input: JSON.stringify({ query: text.slice(0, 255) || 'list tools' })
                    }
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
                usage,
                warnings: []
            });
        }
    });
}

export function createPlaygroundModel(stats: ModelCallStats): LanguageModel {
    const base =
        envs.NANGO_AGENT_PLAYGROUND_PROVIDER === 'openai'
            ? createOpenAI(envs.OPENAI_API_KEY ? { apiKey: envs.OPENAI_API_KEY } : {})(envs.NANGO_AGENT_PLAYGROUND_MODEL)
            : createMockModel();

    return wrapLanguageModel({
        model: base,
        middleware: createCacheMiddleware({
            mode: envs.NANGO_AGENT_PLAYGROUND_CACHE,
            dir: envs.NANGO_AGENT_PLAYGROUND_CACHE_DIR ?? path.join(os.tmpdir(), 'nango-agent-playground-cache'),
            stats
        })
    });
}
