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

export interface AgentSandboxHandle {
    sandbox: Sandbox;
    client: OpencodeClient;
    previewUrl: string;
    previewToken: string;
    serverCommandId: string;
    serverSessionId: string;
}

export async function createAgentSandbox(sessionId: string): Promise<AgentSandboxHandle> {
    const sandbox = await getDaytonaClient().create(
        {
            name: `agent-${sessionId}`,
            snapshot: agentSnapshot,
            envVars: getSandboxEnvVars(),
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
        const client = createOpencodeClient({
            baseUrl: preview.url,
            directory: agentProjectPath,
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
            serverSessionId: opencodeServerSessionId
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

function getSandboxEnvVars(): Record<string, string> {
    const keys = [
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

    return keys.reduce<Record<string, string>>((acc, key) => {
        const value = process.env[key];
        if (value) {
            acc[key] = value;
        }
        return acc;
    }, {});
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
    const functionName = typeof payload['functionName'] === 'string' ? payload['functionName'] : typeof payload['function_name'] === 'string' ? payload['function_name'] : null;
    return functionName ? `Build ${functionName}` : `Agent Run ${randomUUID().slice(0, 8)}`;
}
