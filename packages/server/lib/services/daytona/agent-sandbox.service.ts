import { randomUUID } from 'node:crypto';

import { getLogger } from '@nangohq/utils';
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';

import { getDaytonaClient } from './client.js';

import type { Sandbox } from '@daytonaio/sdk';

const logger = getLogger('daytona-agent-sandbox');

export const agentProjectPath = '/home/daytona/nango-integrations';
const opencodePort = 4096;
const opencodeServerSessionId = 'opencode-server';
const sandboxTimeoutSeconds = 180;
const agentSnapshot = process.env['DAYTONA_AGENT_SNAPSHOT'] || 'nango-opencode-agent';
const defaultAgentModel = 'opencode/kimi-k2.5';

export interface AgentSandboxHandle {
    sandbox: Sandbox;
    client: OpencodeClient;
    previewUrl: string;
    previewToken: string;
    serverCommandId: string;
    serverSessionId: string;
    model: {
        full: string;
        providerID: string;
        modelID: string;
    };
}

export async function createAgentSandbox(sessionId: string, payload: Record<string, unknown>): Promise<AgentSandboxHandle> {
    const model = resolveModel(payload);
    const sandbox = await getDaytonaClient().create(
        {
            name: `agent-${sessionId}`,
            snapshot: agentSnapshot,
            envVars: getSandboxEnvVars(payload, model),
            autoStopInterval: 0,
            autoDeleteInterval: 1440,
            labels: {
                purpose: 'nango-agent',
                sessionId
            }
        },
        { timeout: sandboxTimeoutSeconds }
    );

    try {
        await sandbox.process.createSession(opencodeServerSessionId);
        const command = await sandbox.process.executeSessionCommand(
            opencodeServerSessionId,
            {
                command: `cd ${agentProjectPath} && opencode serve --hostname 0.0.0.0 --port ${opencodePort}`,
                runAsync: true
            },
            sandboxTimeoutSeconds
        );

        if (!command.cmdId) {
            throw new Error('Failed to start OpenCode server in Daytona sandbox');
        }

        const preview = await sandbox.getPreviewLink(opencodePort);
        const previewHeaders = { 'x-daytona-preview-token': preview.token };
        const client = createOpencodeClient({
            baseUrl: preview.url,
            directory: agentProjectPath,
            headers: previewHeaders,
            fetch: async (request) => {
                const headers = new Headers(request.headers);
                headers.set('x-daytona-preview-token', preview.token);
                return fetch(new Request(request, { headers }));
            }
        });

        await waitForOpenCodeServer(preview.url, preview.token, sandbox, command.cmdId);

        return {
            sandbox,
            client,
            previewUrl: preview.url,
            previewToken: preview.token,
            serverCommandId: command.cmdId,
            serverSessionId: opencodeServerSessionId,
            model
        };
    } catch (error) {
        await sandbox.delete(sandboxTimeoutSeconds).catch(() => {});
        throw error;
    }
}

export async function destroyAgentSandbox(handle: Pick<AgentSandboxHandle, 'sandbox'>): Promise<void> {
    await handle.sandbox.delete(sandboxTimeoutSeconds).catch((error) => {
        logger.warn('Failed to delete Daytona agent sandbox', { error });
    });
}

async function waitForOpenCodeServer(previewUrl: string, previewToken: string, sandbox: Sandbox, commandId: string): Promise<void> {
    const maxAttempts = 40;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            const response = await fetch(`${previewUrl}/global/health`, {
                headers: { 'x-daytona-preview-token': previewToken }
            });
            if (response.ok) {
                return;
            }
        } catch {
            // Retry below.
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    let logs = '';
    try {
        const result = await sandbox.process.getSessionCommandLogs(opencodeServerSessionId, commandId);
        logs = result.stderr || result.stdout || result.output || '';
    } catch {
        // Ignore log retrieval failures.
    }

    throw new Error(`Timed out waiting for OpenCode server to start${logs ? `: ${logs}` : ''}`);
}

function getSandboxEnvVars(payload: Record<string, unknown>, model: { providerID: string; modelID: string; full: string }): Record<string, string> {
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
        throw new Error('OPENCODE_API_KEY is required for the Daytona agent runtime when using the OpenCode provider');
    }

    envVars['OPENCODE_CONFIG_CONTENT'] = JSON.stringify(createRuntimeConfig(payload, model));
    return envVars;
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

function resolveModel(_payload: Record<string, unknown>): { providerID: string; modelID: string; full: string } {
    const full = defaultAgentModel;
    const [providerID, ...rest] = full.split('/');
    if (!providerID || rest.length === 0) {
        throw new Error(`Invalid OpenCode model identifier: ${full}`);
    }

    return {
        full,
        providerID,
        modelID: rest.join('/')
    };
}

function createRuntimeConfig(payload: Record<string, unknown>, model: { providerID: string; modelID: string; full: string }): Record<string, unknown> {
    const providerOptions: Record<string, unknown> = {};
    const apiBaseUrl = typeof payload['api_base_url'] === 'string' && payload['api_base_url'].trim().length > 0 ? payload['api_base_url'].trim() : null;
    const apiKey = typeof payload['api_key'] === 'string' && payload['api_key'].trim().length > 0 ? payload['api_key'].trim() : null;

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
