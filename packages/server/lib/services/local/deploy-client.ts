import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { agentProjectPath } from '../agent/agent-runtime.js';
import { buildIndexTs, getFilePaths } from '../remote-function/compiler-client.js';

import type { DeployRequest, DeployResult } from '../remote-function/deploy-client.js';

const execFileAsync = promisify(execFile);

const localCompilerImage = 'agent-sandboxes/blank-workspace:local';
const deployTimeoutMs = 5 * 60 * 1000;

export async function invokeLocalDeploy(request: DeployRequest): Promise<DeployResult> {
    const containerName = `nango-deploy-${randomUUID().slice(0, 8)}`;

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
                '-e',
                'NANGO_DEPLOY_AUTO_CONFIRM=true',
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

        const cmd = buildDeployCommand(request);

        let output: string;
        try {
            const { stdout, stderr } = await execFileAsync('docker', ['exec', '-w', agentProjectPath, containerName, 'bash', '-c', cmd], {
                timeout: deployTimeoutMs
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

function buildDeployCommand(request: DeployRequest): string {
    const typeFlag = request.function_type === 'action' ? `--action ${request.function_name}` : `--sync ${request.function_name}`;
    return `nango deploy ${request.environment_name} ${typeFlag} --auto-confirm --allow-destructive --no-interactive`;
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
