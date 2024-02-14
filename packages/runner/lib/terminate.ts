import { Result, resultOk, resultErr } from '@nangohq/shared';
import { workerProcesses } from './state.js';

export const terminate = async (syncId: string): Promise<Result<string>> => {
    const worker = workerProcesses.get(syncId);
    if (worker) {
        await worker.terminate();
        workerProcesses.delete(syncId);
        return resultOk('cancelled');
    } else {
        return resultErr('child process not found');
    }
};
