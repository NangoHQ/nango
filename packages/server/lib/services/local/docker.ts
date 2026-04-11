import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

export const execDockerFileAsync = promisify(execFile);

export function rewriteDockerHostForLocalhost(nangoHost: string): string {
    return nangoHost.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, (_, _host, port) => `http://host.docker.internal${port ?? ''}`);
}

export function getExecErrorOutput(error: unknown): string {
    if (error && typeof error === 'object') {
        const err = error as Record<string, unknown>;
        if (typeof err['stderr'] === 'string' && err['stderr']) {
            return err['stderr'];
        }
        if (typeof err['stdout'] === 'string' && err['stdout']) {
            return err['stdout'];
        }
        if (typeof err['message'] === 'string' && err['message']) {
            return err['message'];
        }
    }

    return String(error);
}

export async function writeContainerFile(containerName: string, filePath: string, content: string): Promise<void> {
    const dir = path.posix.dirname(filePath);
    await execDockerFileAsync('docker', ['exec', containerName, 'mkdir', '-p', dir]);

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
    const { stdout } = await execDockerFileAsync('docker', ['exec', containerName, 'cat', filePath]);
    return stdout;
}
