import { getLogger } from '@nangohq/utils';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { Sandbox } from 'e2b';

import { agentProjectPath, createRuntimeConfig, getSandboxEnvVars, resolveModel, resolvePayload } from '../agent/agent-runtime.js';

import type { AgentRuntimeHandle } from '../agent/agent-runtime.js';

export type { AgentRuntimeHandle };

const logger = getLogger('e2b-agent-sandbox');

const opencodePort = 4096;
export const agentSandboxTimeoutMs = 5 * 60 * 1000;
const timeoutRefreshThrottleMs = 60 * 1000;
const agentTemplate = process.env['E2B_AGENT_TEMPLATE'] || 'nango-opencode-agent';

export async function createAgentSandbox(sessionId: string, payload: Record<string, unknown>): Promise<AgentRuntimeHandle> {
    if (!process.env['E2B_API_KEY']) {
        throw new Error('E2B_API_KEY is required for the E2B agent runtime');
    }

    const model = resolveModel();
    payload = resolvePayload(payload);
    const sandboxEnv = getSandboxEnvVars(payload, model);
    const sandbox = await Sandbox.create(agentTemplate, {
        timeoutMs: agentSandboxTimeoutMs,
        allowInternetAccess: true,
        metadata: {
            purpose: 'nango-agent',
            sessionId,
            createdBy: 'nango-server'
        },
        network: {
            allowPublicTraffic: true
        }
    });

    await sandbox.files.write(`${agentProjectPath}/opencode.json`, JSON.stringify(createRuntimeConfig(payload, model), null, 2));

    const accessToken = sandbox.trafficAccessToken;
    const baseUrl = `https://${sandbox.getHost(opencodePort)}`;
    const serverHandle = await sandbox.commands.run(`opencode serve --hostname 0.0.0.0 --port ${opencodePort}`, {
        cwd: agentProjectPath,
        envs: sandboxEnv,
        background: true,
        timeoutMs: 0
    });
    const client = createOpencodeClient({
        baseUrl,
        directory: agentProjectPath,
        headers: accessToken ? { 'e2b-traffic-access-token': accessToken } : undefined,
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
        client,
        baseUrl,
        accessToken,
        sandboxId: sandbox.sandboxId,
        serverPid: serverHandle.pid,
        model,
        resolvedPayload: payload,
        refreshTimeout: async (timeoutMs: number) => {
            await sandbox.setTimeout(timeoutMs).catch((error) => {
                logger.warn('Failed to refresh E2B agent sandbox timeout', { error, sandboxId: sandbox.sandboxId, timeoutMs });
            });
        },
        destroy: async () => {
            await sandbox.kill().catch((error) => {
                logger.warn('Failed to kill E2B agent sandbox', { error });
            });
        }
    };
}

export async function refreshAgentSandboxTimeout(handle: AgentRuntimeHandle, timeoutMs: number = agentSandboxTimeoutMs): Promise<void> {
    await handle.refreshTimeout?.(timeoutMs);
}

export function shouldRefreshAgentSandboxTimeout(lastRefreshAt: number, now: number = Date.now()): boolean {
    return now - lastRefreshAt >= timeoutRefreshThrottleMs;
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
