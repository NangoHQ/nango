import { createOpenAI } from '@ai-sdk/openai';
import { simulateStreamingMiddleware, wrapLanguageModel } from 'ai';

import { envs } from '../env.js';
import { createMockModel } from './agentPlaygroundMockModel.js';

import type { LanguageModel } from 'ai';

export function createPlaygroundModel(): LanguageModel {
    if (envs.OPENAI_API_KEY) {
        return createOpenAI({ apiKey: envs.OPENAI_API_KEY })(envs.NANGO_AGENT_PLAYGROUND_MODEL);
    }
    return createStreamingMockModel();
}

export function createStreamingMockModel(): LanguageModel {
    return wrapLanguageModel({ model: createMockModel(), middleware: simulateStreamingMiddleware() });
}
