import { randomUUID } from 'node:crypto';

import type { OpencodeClient } from '@opencode-ai/sdk';

export const agentProjectPath = '/home/user/nango-integrations';
const defaultAgentModel = 'opencode/kimi-k2.5';

/**
 * Inject server-side values into the payload before passing to the agent.
 * This ensures nango_base_url always reflects the actual server URL, regardless of what the client sent.
 */
export function resolvePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const serverUrl = process.env['NANGO_SERVER_URL'];
    return {
        ...payload,
        nango_base_url: serverUrl ?? payload['nango_base_url'] ?? 'https://api-development.nango.dev'
    };
}

export interface AgentRuntimeHandle {
    client: OpencodeClient;
    baseUrl: string;
    accessToken: string | undefined;
    sandboxId: string;
    serverPid: number;
    model: {
        full: string;
        providerID: string;
        modelID: string;
    };
    /** Payload after any runtime-specific rewrites (e.g. localhost → host.docker.internal). Use this for the agent prompt. */
    resolvedPayload: Record<string, unknown>;
    /** E2B: extend sandbox lifetime. Omitted for local Docker and other runtimes without a hosted timeout. */
    refreshTimeout?: (timeoutMs: number) => Promise<void>;
    destroy(): Promise<void>;
}

export function resolveModel(): { providerID: string; modelID: string; full: string } {
    const full = defaultAgentModel;
    const [providerID, ...rest] = full.split('/');
    if (!providerID || rest.length === 0) {
        throw new Error(`Invalid OpenCode model identifier: ${full}`);
    }
    return { full, providerID, modelID: rest.join('/') };
}

export function getSandboxEnvVars(payload: Record<string, unknown>, model: { providerID: string }): Record<string, string> {
    const keys = [
        'OPENCODE_API_KEY',
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'OPENROUTER_API_KEY',
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
        'XAI_API_KEY',
        'MISTRAL_API_KEY',
        'DEEPSEEK_API_KEY',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_REGION',
        'AWS_BEARER_TOKEN_BEDROCK',
        'AZURE_OPENAI_API_KEY',
        'AZURE_OPENAI_ENDPOINT'
    ];

    const envVars = keys.reduce<Record<string, string>>((acc, key) => {
        const value = process.env[key];
        if (value) {
            acc[key] = value;
        }
        return acc;
    }, {});

    const overrideApiKey = typeof payload['api_key'] === 'string' && payload['api_key'].trim().length > 0 ? payload['api_key'].trim() : null;
    if (overrideApiKey) {
        envVars['OPENCODE_API_KEY'] = overrideApiKey;
    }

    if (model.providerID === 'opencode' && !envVars['OPENCODE_API_KEY']) {
        throw new Error('OPENCODE_API_KEY is required when using the OpenCode provider');
    }

    return envVars;
}

export function createRuntimeConfig(payload: Record<string, unknown>, model: { providerID: string; modelID: string; full: string }): Record<string, unknown> {
    const providerOptions: Record<string, unknown> = {};
    const apiBaseUrl = typeof payload['api_base_url'] === 'string' && payload['api_base_url'].trim().length > 0 ? payload['api_base_url'].trim() : null;
    const apiKey =
        typeof payload['api_key'] === 'string' && payload['api_key'].trim().length > 0
            ? payload['api_key'].trim()
            : model.providerID === 'opencode'
              ? process.env['OPENCODE_API_KEY'] || null
              : null;

    if (apiBaseUrl) {
        providerOptions['baseURL'] = apiBaseUrl;
    }
    if (apiKey) {
        providerOptions['apiKey'] = apiKey;
    }

    const config: Record<string, unknown> = {
        model: model.full,
        small_model: model.full,
        enabled_providers: [model.providerID],
        permission: {
            '*': 'allow',
            external_directory: {
                '/**': 'allow'
            }
        }
    };

    if (Object.keys(providerOptions).length > 0) {
        config['provider'] = {
            [model.providerID]: {
                options: providerOptions
            }
        };
    }

    return config;
}

export function createAgentPrompt(payload: Record<string, unknown>): string {
    const prompt = typeof payload['prompt'] === 'string' && payload['prompt'].trim().length > 0 ? payload['prompt'].trim() : 'Build a Nango function.';

    const context = { ...payload };
    delete context['prompt'];

    const contextBlock = Object.keys(context).length > 0 ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : '';

    return `${prompt}\n\nYou are working inside a prepared Nango project at ${agentProjectPath}. Use the installed skill named nango-remote-function-builder from .agents/skills when relevant.${contextBlock}`;
}

export function createAnswerPrompt(answer: string): string {
    return `User response: ${answer}\n\nContinue from the current session state.`;
}

export function createSessionTitle(payload: Record<string, unknown>): string {
    const functionName =
        typeof payload['functionName'] === 'string' ? payload['functionName'] : typeof payload['function_name'] === 'string' ? payload['function_name'] : null;
    return functionName ? `Build ${functionName}` : `Agent Run ${randomUUID().slice(0, 8)}`;
}
