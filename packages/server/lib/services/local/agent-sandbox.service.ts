import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

import { createOpencodeClient } from '@opencode-ai/sdk/v2';

import { getLogger } from '@nangohq/utils';

import { agentProjectPath, createRuntimeConfig, resolvePayload } from '../agent/agent-runtime.js';

import type { AgentRuntimeHandle, AgentSessionPayload, AgentSessionResolvedPayload } from '../agent/agent-runtime.js';

const execFileAsync = promisify(execFile);
const logger = getLogger('local-agent-sandbox');

const opencodePort = 4096;
export const localAgentImageName = 'agent-sandboxes/agent-workspace:local';

export async function createLocalAgentSandbox(
    sessionId: string,
    payload: AgentSessionPayload,
    onProgress?: (message: string) => void
): Promise<AgentRuntimeHandle> {
    const resolvedPayload: AgentSessionResolvedPayload = rewriteLocalhostUrl(resolvePayload(payload));
    const hostPort = await findFreePort();
    const containerName = `nango-agent-${sessionId.slice(0, 8)}`;

    onProgress?.('Starting container...');
    await execFileAsync('docker', [
        'run',
        '-d',
        '--name',
        containerName,
        '-p',
        `${hostPort}:${opencodePort}`,
        '-e',
        `OPENCODE_API_KEY=${process.env['OPENCODE_API_KEY'] ?? ''}`,
        localAgentImageName,
        'sleep',
        'infinity'
    ]);

    await writeFileToContainer(containerName, `${agentProjectPath}/opencode.json`, JSON.stringify(createRuntimeConfig(), null, 2));

    onProgress?.('Starting OpenCode server...');
    await execFileAsync('docker', [
        'exec',
        '-d',
        '-w',
        agentProjectPath,
        containerName,
        'bash',
        '-c',
        `opencode serve --hostname 0.0.0.0 --port ${opencodePort} > /tmp/opencode.log 2>&1`
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
        resolvedPayload,
        destroy: async () => {
            await execFileAsync('docker', ['rm', '-f', containerName]).catch((err: unknown) => {
                logger.warn('Failed to remove local agent container', { containerName, error: err });
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
            // retry
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const logs = await execFileAsync('docker', ['exec', containerName, 'cat', '/tmp/opencode.log'])
        .then((r) => r.stdout)
        .catch(() => '');
    throw new Error(`Timed out waiting for OpenCode server to start in local container${logs ? `: ${logs}` : ''}`);
}

// Inside Docker, localhost/127.0.0.1 refers to the container itself, update to use host.docker.internal
function rewriteLocalhostUrl(payload: AgentSessionResolvedPayload): AgentSessionResolvedPayload {
    return {
        ...payload,
        nango_base_url: payload.nango_base_url.replace(
            /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g,
            (_, _host, port) => `http://host.docker.internal${port ?? ''}`
        )
    };
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
