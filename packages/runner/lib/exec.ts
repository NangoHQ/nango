import { spawn } from 'child_process';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { childProcesses } from './state.js';
import { end } from './kill.js';
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
            detached: true,
            env: { ...process.env },
            stdio: [process.stdin, process.stdout, process.stderr, 'ipc']
        });

        if (!child) {
            const error = new NangoError('Child process failed to spawn.');
            resolve({ success: false, error, response: null });
        }

        child.on('message', (message: any) => {
            resolve(message.result);
            end(nangoProps.syncId as string);
        });

        child.on('exit', (_code, signal) => {
            if (signal === 'SIGKILL') {
                // TODO use Result and migrate the runner to return resultErr/resultOk
                resolve({ success: true, error: null, response: { cancelled: true } });
            }
        });

        child.on('error', (error) => {
            end(nangoProps.syncId as string);
            reject(error);
        });

        const pid = child.pid;

        if (pid) {
            childProcesses.set(nangoProps.syncId as string, pid);
        }

        child.send({ nangoProps, isInvokedImmediately, isWebhook, code, codeParams });
    });
}
