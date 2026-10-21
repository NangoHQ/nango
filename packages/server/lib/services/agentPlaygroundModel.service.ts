import { createOpenAI } from '@ai-sdk/openai';
import { defaultSettingsMiddleware, simulateStreamingMiddleware, wrapLanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import { isDocker } from '@nangohq/utils';

import { envs } from '../env.js';
import { createMockModel } from './agentPlaygroundMockModel.js';
import { ModelKeyMissingError } from './agentPlaygroundModelError.js';

import type { LanguageModel } from 'ai';

export function createPlaygroundModel(): LanguageModel {
    if (envs.OPENAI_API_KEY) {
        return wrapLanguageModel({
            model: createOpenAI({ apiKey: envs.OPENAI_API_KEY })(envs.NANGO_AGENT_PLAYGROUND_MODEL),
            middleware: defaultSettingsMiddleware({ settings: { providerOptions: { openai: { store: false } } } })
        });
    }
    // Every deployed image is dockerized. isLocal is false locally too, because .env sets NANGO_CLOUD.
    if (isDocker) {
        return createKeyMissingModel();
    }
    return createStreamingMockModel();
}

export function createStreamingMockModel(): LanguageModel {
    return wrapLanguageModel({ model: createMockModel(), middleware: simulateStreamingMiddleware() });
}

function createKeyMissingModel(): LanguageModel {
    return new MockLanguageModelV4({
        modelId: 'missing-key',
        doGenerate: () => Promise.reject(new ModelKeyMissingError()),
        doStream: () => Promise.reject(new ModelKeyMissingError())
    });
}
