import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

import { getLogger } from '@nangohq/utils';
import { createOpencodeClient } from '@opencode-ai/sdk';

import { agentProjectPath, createRuntimeConfig, getSandboxEnvVars, resolveModel, resolvePayload } from '../agent/agent-runtime.js';

import type { AgentRuntimeHandle } from '../agent/agent-runtime.js';

const execFileAsync = promisify(execFile);
const logger = getLogger('local-agent-sandbox');

const opencodePort = 4096;
export const localAgentImageName = process.env['LOCAL_AGENT_IMAGE'] || 'nango-local-agent';

export async function createLocalAgentSandbox(sessionId: string, payload: Record<string, unknown>, onProgress?: (message: string) => void): Promise<AgentRuntimeHandle> {
    const model = resolveModel();
    const resolvedPayload = rewriteLocalhostUrls(resolvePayload(payload));
    const envVars = getSandboxEnvVars(resolvedPayload, model);
    const hostPort = await findFreePort();
    const containerName = `nango-agent-${sessionId.slice(0, 8)}`;

    const envArgs = Object.entries(envVars).flatMap(([k, v]) => ['-e', `${k}=${v}`]);

    onProgress?.('Starting container...');
    await execFileAsync('docker', [
        'run', '-d',
        '--name', containerName,
        '-p', `${hostPort}:${opencodePort}`,
        ...envArgs,
        localAgentImageName
    ]);

    await writeFileToContainer(containerName, `${agentProjectPath}/opencode.json`, JSON.stringify(createRuntimeConfig(resolvedPayload, model), null, 2));

    onProgress?.('Starting OpenCode server...');
    await execFileAsync('docker', [
        'exec', '-d',
        '-w', agentProjectPath,
        containerName,
        'bash', '-c', `opencode serve --hostname 0.0.0.0 --port ${opencodePort} > /tmp/opencode.log 2>&1`
    ]);

    const baseUrl = `http://localhost:${hostPort}`;
    const client = createOpencodeClient({ baseUrl, directory: agentProjectPath });

    await waitForOpenCodeServer(baseUrl, containerName);

    return {
        client,
        baseUrl,
        accessToken: undefined,
        sandboxId: containerName,
        serverPid: 0,
        model,
        resolvedPayload,
        destroy: async () => {
            await execFileAsync('docker', ['rm', '-f', containerName]).catch((error) => {
                logger.warn('Failed to remove local agent container', { containerName, error });
            });
        }
    };
}

async function writeFileToContainer(containerName: string, filePath: string, content: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const proc = spawn('docker', ['exec', '-i', containerName, 'bash', '-c', `cat > ${filePath}`]);
        proc.stdin.write(content);
        proc.stdin.end();
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`docker exec write exited with code ${code}`))));
        proc.on('error', reject);
    });
}

async function waitForOpenCodeServer(baseUrl: string, containerName: string): Promise<void> {
    const maxAttempts = 40;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/global/health`);
            if (response.ok) {
                return;
            }
        } catch {
            // Retry below.
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const logs = await execFileAsync('docker', ['exec', containerName, 'cat', '/tmp/opencode.log']).then((r) => r.stdout).catch(() => '');
    throw new Error(`Timed out waiting for OpenCode server to start in local container${logs ? `: ${logs}` : ''}`);
}

// Inside Docker, localhost/127.0.0.1 refers to the container itself.
// Rewrite those to host.docker.internal so the agent can reach the host's services.
function rewriteLocalhostUrls(payload: Record<string, unknown>): Record<string, unknown> {
    const rewritten: Record<string, unknown> = { ...payload };
    for (const key of Object.keys(rewritten)) {
        const value = rewritten[key];
        if (typeof value === 'string') {
            rewritten[key] = value.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g, (_, _host, port) => `http://host.docker.internal${port ?? ''}`);
        }
    }
    return rewritten;
}

function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            server.close(() => {
                if (addr && typeof addr === 'object') {
                    resolve(addr.port);
                } else {
                    reject(new Error('Failed to find a free port'));
                }
            });
        });
        server.on('error', reject);
    });
}
