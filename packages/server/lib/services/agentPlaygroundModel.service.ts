import { createOpenAI } from '@ai-sdk/openai';
import { simulateStreamingMiddleware, wrapLanguageModel } from 'ai';

import { envs } from '../env.js';
import { createMockModel } from './agentPlaygroundMockModel.js';

import type { LanguageModel } from 'ai';

const MODEL_LABELS: Record<string, string> = {
    'gpt-6-luna': 'GPT-6 Luna'
};

export function createPlaygroundModel(): LanguageModel {
    if (envs.OPENAI_API_KEY) {
        return createOpenAI({ apiKey: envs.OPENAI_API_KEY })(envs.NANGO_AGENT_PLAYGROUND_MODEL);
    }
    return createStreamingMockModel();
}

export function playgroundModelLabel(): { label: string; provider: string | null } {
    if (!envs.OPENAI_API_KEY) {
        return { label: 'Mock model', provider: null };
    }
    const model = envs.NANGO_AGENT_PLAYGROUND_MODEL;
    return { label: MODEL_LABELS[model] ?? model, provider: 'openai' };
}

export function createStreamingMockModel(): LanguageModel {
    return wrapLanguageModel({ model: createMockModel(), middleware: simulateStreamingMiddleware() });
}
