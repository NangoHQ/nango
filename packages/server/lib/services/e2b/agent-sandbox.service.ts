import { createOpencodeClient } from '@opencode-ai/sdk/v2';
import { Sandbox } from 'e2b';

import { getLogger } from '@nangohq/utils';

import { AGENT_MODEL, agentProjectPath, createAgentPrompt, createRuntimeConfig, resolvePayload } from '../agent/agent-runtime.js';

import type { AgentRuntimeHandle, AgentSessionPayload, AgentSessionResolvedPayload } from '../agent/agent-runtime.js';

export type { AgentRuntimeHandle };

const logger = getLogger('e2b-agent-sandbox');

const opencodePort = 4096;
export const agentSandboxTimeoutMs = 10 * 60 * 1000; // 10 minutes per spec
const timeoutRefreshThrottleMs = 60 * 1000;
const agentTemplate = 'agent-workspace:staging';

export async function createAgentSandbox(sessionId: string, payload: AgentSessionPayload, onProgress?: (message: string) => void): Promise<AgentRuntimeHandle> {
    const apiKey = process.env['E2B_API_KEY'];
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B agent runtime');
    }

    const resolvedPayload: AgentSessionResolvedPayload = resolvePayload(payload);
    onProgress?.('Creating sandbox...');
    const sandbox = await Sandbox.create(agentTemplate, {
        timeoutMs: agentSandboxTimeoutMs,
        allowInternetAccess: true,
        metadata: { purpose: 'nango-agent', sessionId, createdBy: 'nango-server' },
        network: { allowPublicTraffic: true },
        apiKey
    });

    // This assumes the template does not auto-start OpenCode; Nango owns config injection and process startup.
    await sandbox.files.write(`${agentProjectPath}/opencode.json`, JSON.stringify(createRuntimeConfig(), null, 2));

    const accessToken = sandbox.trafficAccessToken;
    const baseUrl = `https://${sandbox.getHost(opencodePort)}`;
    onProgress?.('Starting OpenCode server...');
    const serverHandle = await sandbox.commands.run(`opencode serve --hostname 0.0.0.0 --port ${opencodePort}`, {
        cwd: agentProjectPath,
        envs: { OPENCODE_API_KEY: process.env['OPENCODE_API_KEY'] ?? '' },
        background: true,
        timeoutMs: 0
    });

    const client = createOpencodeClient({
        baseUrl,
        directory: agentProjectPath,
        headers: accessToken ? { 'e2b-traffic-access-token': accessToken } : undefined,
        fetch: async (input, init) => {
            if (!accessToken) {
                return fetch(input, init);
            }
            const merged = new Headers(input instanceof Request ? input.headers : init?.headers);
            merged.set('e2b-traffic-access-token', accessToken);
            const reqInit = { ...init, headers: merged };
            return fetch(input instanceof Request ? new Request(input, reqInit) : input, reqInit);
        }
    });

    await waitForOpenCodeServer(baseUrl, accessToken, serverHandle);

    return {
        client,
        baseUrl,
        accessToken,
        sandboxId: sandbox.sandboxId,
        serverPid: serverHandle.pid,
        resolvedPayload,
        refreshTimeout: async (timeoutMs: number) => {
            await sandbox.setTimeout(timeoutMs).catch((err: unknown) => {
                logger.warn('Failed to refresh E2B agent sandbox timeout', { error: err, sandboxId: sandbox.sandboxId, timeoutMs });
            });
        },
        destroy: async () => {
            await sandbox.kill().catch((err: unknown) => {
                logger.warn('Failed to kill E2B agent sandbox', { error: err });
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
            // retry
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const logs = [serverHandle.stdout, serverHandle.stderr].filter(Boolean).join('\n');
    throw new Error(`Timed out waiting for OpenCode server to start in E2B sandbox${logs ? `: ${logs}` : ''}`);
}

// Re-exported for use in session service
export { AGENT_MODEL, createAgentPrompt };
