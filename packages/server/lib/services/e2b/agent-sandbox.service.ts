import { randomUUID } from 'node:crypto';

import { getLogger } from '@nangohq/utils';
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import { Sandbox } from 'e2b';

const logger = getLogger('e2b-agent-sandbox');

export const agentProjectPath = '/home/user/nango-integrations';
const opencodePort = 4096;
const sandboxTimeoutMs = 30 * 60 * 1000;
const agentTemplate = process.env['E2B_AGENT_TEMPLATE'] || 'nango-opencode-agent';
const defaultAgentModel = 'opencode/kimi-k2.5';

export interface AgentSandboxHandle {
    sandbox: Sandbox;
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
}

export async function createAgentSandbox(sessionId: string, payload: Record<string, unknown>): Promise<AgentSandboxHandle> {
    if (!process.env['E2B_API_KEY']) {
        throw new Error('E2B_API_KEY is required for the E2B agent runtime');
    }

    const model = resolveModel();
    const sandboxEnv = getSandboxEnvVars(payload, model);
    const sandbox = await Sandbox.create(agentTemplate, {
        timeoutMs: sandboxTimeoutMs,
        allowInternetAccess: true,
        metadata: {
            purpose: 'nango-agent',
            sessionId,
            createdBy: 'nango-server'
        },
        network: {
            allowPublicTraffic: false
        }
    });

    await sandbox.files.write(`${agentProjectPath}/opencode.json`, JSON.stringify(createRuntimeConfig(payload, model), null, 2));

    const accessToken = sandbox.trafficAccessToken;
    const baseUrl = `https://${sandbox.getHost(opencodePort)}`;
    const headers = accessToken ? { 'e2b-traffic-access-token': accessToken } : undefined;
    const serverHandle = await sandbox.commands.run(`opencode serve --hostname 0.0.0.0 --port ${opencodePort}`, {
        cwd: agentProjectPath,
        envs: sandboxEnv,
        background: true,
        timeoutMs: 0
    });
    const client = createOpencodeClient({
        baseUrl,
        directory: agentProjectPath,
        headers,
        fetch: async (request) => {
            if (!accessToken) {
                return fetch(request);
            }
            const merged = new Headers(request.headers);
            merged.set('e2b-traffic-access-token', accessToken);
            return fetch(new Request(request, { headers: merged }));
        }
    });

    await waitForOpenCodeServer(baseUrl, accessToken, serverHandle);

    return {
        sandbox,
        client,
        baseUrl,
        accessToken,
        sandboxId: sandbox.sandboxId,
        serverPid: serverHandle.pid,
        model
    };
}

export async function destroyAgentSandbox(handle: Pick<AgentSandboxHandle, 'sandbox'>): Promise<void> {
    await handle.sandbox.kill().catch((error) => {
        logger.warn('Failed to kill E2B agent sandbox', { error });
    });
}

async function waitForOpenCodeServer(baseUrl: string, accessToken: string | undefined, serverHandle: { stdout: string; stderr: string }): Promise<void> {
    const maxAttempts = 40;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            const init = accessToken ? { headers: { 'e2b-traffic-access-token': accessToken } } : {};
            const response = await fetch(`${baseUrl}/global/health`, init);
            if (response.ok) {
                return;
            }
        } catch {
            // Retry below.
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const logs = [serverHandle.stdout, serverHandle.stderr].filter(Boolean).join('\n');
    throw new Error(`Timed out waiting for OpenCode server to start in E2B sandbox${logs ? `: ${logs}` : ''}`);
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
        throw new Error('OPENCODE_API_KEY is required for the E2B agent runtime when using the OpenCode provider');
    }

    return envVars;
}

export function createAgentPrompt(payload: Record<string, unknown>): string {
    const prompt = typeof payload['prompt'] === 'string' && payload['prompt'].trim().length > 0 ? payload['prompt'].trim() : 'Build a Nango function.';

    const context = { ...payload };
    delete context['prompt'];

    const contextBlock = Object.keys(context).length > 0 ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : '';

    return `${prompt}\n\nYou are working inside a prepared Nango project at ${agentProjectPath}. Use the installed skill named nango-remote-function-builder from .agents/skills when relevant. If you need missing user input, reply with a single line that starts with QUESTION: followed by the exact question, then stop and wait for the user answer.${contextBlock}`;
}

export function createAnswerPrompt(answer: string): string {
    return `User response: ${answer}\n\nContinue from the current session state.`;
}

export function createSessionTitle(payload: Record<string, unknown>): string {
    const functionName =
        typeof payload['functionName'] === 'string' ? payload['functionName'] : typeof payload['function_name'] === 'string' ? payload['function_name'] : null;
    return functionName ? `Build ${functionName}` : `Agent Run ${randomUUID().slice(0, 8)}`;
}

function resolveModel(): { providerID: string; modelID: string; full: string } {
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
