import { spawn } from 'child_process';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { childProcesses } from './state.js';
import { NangoProps, isTest, RunnerOutput, NangoError } from '@nangohq/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function exec(
    nangoProps: NangoProps,
    isInvokedImmediately: boolean,
    isWebhook: boolean,
    code: string,
    codeParams?: object
): Promise<RunnerOutput> {
    return new Promise((resolve, reject) => {
        const childPath = isTest() ? path.resolve(__dirname, '../dist/child.js') : path.resolve(__dirname, './child.js');

        const child = spawn('node', [childPath], {
            env: { ...process.env },
            stdio: [process.stdin, process.stdout, process.stderr, 'ipc']
        });

        if (!child) {
            const error = new NangoError('Child process failed to spawn.');
            resolve({ success: false, error, response: null });
        }

        child.on('message', (message: any) => {
            resolve(message.result);
        });

        child.on('exit', (code) => {
            if (code !== 0) {
                // TODO use Result and migrate the runner to return resultErr/resultOk
                resolve({ success: true, error: null, response: { cancelled: true } });
            }
        });

        child.on('error', reject);

        childProcesses.set(nangoProps.syncId as string, child);

        child.send({ nangoProps, isInvokedImmediately, isWebhook, code, codeParams });
    });
}
