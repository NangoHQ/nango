import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { getCommandOutput } from '../remote-function/command-output.js';

import type { ExecFileOptions } from 'node:child_process';

const execFileAsync = promisify(execFile);

export async function execDockerFileAsync(args: string[], options?: ExecFileOptions): Promise<{ stdout: string; stderr: string }> {
    const { stdout, stderr } = await execFileAsync('docker', args, options);
    return { stdout: String(stdout), stderr: String(stderr) };
}

export function rewriteDockerHostForLocalhost(nangoHost: string): string {
    return nangoHost.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, (_, _host, port) => `http://host.docker.internal${port ?? ''}`);
}

export function getExecErrorOutput(error: unknown): string {
    return getCommandOutput(error, String(error));
}

export function isExecTimeoutError(error: unknown): boolean {
    if (error && typeof error === 'object') {
        const err = error as Record<string, unknown>;
        if (err['killed'] === true || err['code'] === 'ETIMEDOUT') {
            return true;
        }
        if (typeof err['message'] === 'string' && /timed out|timeout/i.test(err['message'])) {
            return true;
        }
    }

    return false;
}

export async function writeContainerFile(containerName: string, filePath: string, content: string): Promise<void> {
    const dir = path.posix.dirname(filePath);
    await execDockerFileAsync(['exec', containerName, 'mkdir', '-p', dir]);

    await new Promise<void>((resolve, reject) => {
        const proc = spawn('docker', ['exec', '-i', containerName, 'tee', filePath], {
            stdio: ['pipe', 'ignore', 'pipe']
        });

        proc.stdin.write(content);
        proc.stdin.end();
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`docker exec write exited with code ${code}`))));
        proc.on('error', reject);
    });
}

export async function readContainerFile(containerName: string, filePath: string): Promise<string> {
    const { stdout } = await execDockerFileAsync(['exec', containerName, 'cat', filePath]);
    return stdout;
}
