import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
//import { workerProcesses } from './state.js';
import type { NangoProps, RunnerOutput } from '@nangohq/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function exec(
    nangoProps: NangoProps,
    isInvokedImmediately: boolean,
    isWebhook: boolean,
    code: string,
    codeParams?: object
): Promise<RunnerOutput> {
    return new Promise((resolve, reject) => {
        const workerPath = path.resolve(__dirname, './worker.js');

        const workerData = { nangoProps, isInvokedImmediately, isWebhook, code, codeParams };

        const worker = new Worker(workerPath, { workerData });

        worker.on('message', (result: RunnerOutput) => {
            resolve(result);
        });

        worker.on('error', (error) => {
            reject(error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                // TODO use Result and migrate the runner to return resultErr/resultOk
                resolve({ success: true, error: null, response: { cancelled: true } });
            }
        });
        // see how much memory a worker is using

        //workerProcesses.set(nangoProps.syncId as string, worker);
    });
}
