import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { agentProjectPath } from '../agent/agent-runtime.js';
import { buildIndexTs, getFilePaths } from '../remote-function/compiler-client.js';

import type { DryrunRequest, DryrunResult } from '../remote-function/dryrun-client.js';

const execFileAsync = promisify(execFile);

const localCompilerImage = 'agent-sandboxes/blank-workspace:local';
const compileTimeoutMs = 3 * 60 * 1000;
const dryrunTimeoutMs = 5 * 60 * 1000;

export async function invokeLocalDryrun(request: DryrunRequest): Promise<DryrunResult> {
    const containerName = `nango-dryrun-${randomUUID().slice(0, 8)}`;

    // Rewrite localhost so the container can reach the host Nango server
    const nangoHost = request.nango_host.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, (_, _h, port) => `http://host.docker.internal${port ?? ''}`);

    try {
        await execFileAsync(
            'docker',
            [
                'run',
                '-d',
                '--name',
                containerName,
                '-e',
                `NANGO_SECRET_KEY=${request.nango_secret_key}`,
                '-e',
                `NANGO_HOSTPORT=${nangoHost}`,
                '-e',
                'NO_COLOR=1',
                '--add-host',
                'host.docker.internal:host-gateway',
                localCompilerImage,
                'sleep',
                '300'
            ],
            { timeout: 10_000 }
        );

        const { tsFilePath } = getFilePaths(request);

        await writeContainerFile(containerName, `${agentProjectPath}/${tsFilePath}`, request.code);
        await writeContainerFile(containerName, `${agentProjectPath}/index.ts`, buildIndexTs(request));

        // Compile first
        try {
            await execFileAsync('docker', ['exec', '-w', agentProjectPath, '-e', 'NO_COLOR=1', containerName, 'nango', 'compile'], {
                timeout: compileTimeoutMs
            });
        } catch (err) {
            return { output: err instanceof Error ? err.message : String(err) };
        }

        // Write optional JSON arg files
        if (request.input !== undefined) {
            await writeContainerFile(containerName, '/tmp/nango-dryrun-input.json', JSON.stringify(request.input));
        }
        if (request.metadata) {
            await writeContainerFile(containerName, '/tmp/nango-dryrun-metadata.json', JSON.stringify(request.metadata));
        }
        if (request.checkpoint) {
            await writeContainerFile(containerName, '/tmp/nango-dryrun-checkpoint.json', JSON.stringify(request.checkpoint));
        }

        const cmd = buildDryrunCommand(request);

        let output: string;
        try {
            const { stdout, stderr } = await execFileAsync('docker', ['exec', '-w', agentProjectPath, containerName, 'bash', '-c', cmd], {
                timeout: dryrunTimeoutMs
            });
            output = stdout || stderr;
        } catch (err) {
            output = err instanceof Error ? err.message : String(err);
        }

        return { output };
    } finally {
        await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
    }
}

function buildDryrunCommand(request: DryrunRequest): string {
    const parts = [
        'nango',
        'dryrun',
        request.function_name,
        request.connection_id,
        `--environment ${request.environment_name}`,
        `--integration-id ${request.integration_id}`,
        '--auto-confirm',
        '--no-interactive'
    ];

    if (request.input !== undefined) {
        parts.push('--input @/tmp/nango-dryrun-input.json');
    }
    if (request.metadata) {
        parts.push('--metadata @/tmp/nango-dryrun-metadata.json');
    }
    if (request.checkpoint) {
        parts.push('--checkpoint @/tmp/nango-dryrun-checkpoint.json');
    }
    if (request.last_sync_date) {
        parts.push(`--lastSyncDate ${request.last_sync_date}`);
    }

    return parts.join(' ');
}

async function writeContainerFile(containerName: string, filePath: string, content: string): Promise<void> {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    await execFileAsync('docker', ['exec', containerName, 'mkdir', '-p', dir]);

    await new Promise<void>((resolve, reject) => {
        const proc = spawn('docker', ['exec', '-i', containerName, 'bash', '-c', `cat > ${filePath}`]);
        proc.stdin.write(content);
        proc.stdin.end();
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`docker exec write exited with code ${code}`))));
        proc.on('error', reject);
    });
}
