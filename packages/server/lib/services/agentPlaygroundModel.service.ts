import { createOpenAI } from '@ai-sdk/openai';
import { defaultSettingsMiddleware, simulateStreamingMiddleware, wrapLanguageModel } from 'ai';

import { envs } from '../env.js';
import { createMockModel } from './agentPlaygroundMockModel.js';

import type { LanguageModel } from 'ai';

export function createPlaygroundModel(): LanguageModel {
    if (envs.OPENAI_API_KEY) {
        return wrapLanguageModel({
            model: createOpenAI({ apiKey: envs.OPENAI_API_KEY })(envs.NANGO_AGENT_PLAYGROUND_MODEL),
            middleware: defaultSettingsMiddleware({ settings: { providerOptions: { openai: { store: false } } } })
        });
    }
    return createStreamingMockModel();
}

export function createStreamingMockModel(): LanguageModel {
    return wrapLanguageModel({ model: createMockModel(), middleware: simulateStreamingMiddleware() });
}
