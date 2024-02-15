import { Result, resultOk, resultErr } from '@nangohq/shared';
import { childProcesses } from './state.js';

export const kill = (syncId: string): Result<string> => {
    const pid = childProcesses.get(syncId);
    if (pid) {
        process.kill(pid, 'SIGKILL');
        childProcesses.delete(syncId);
        return resultOk('cancelled');
    } else {
        return resultErr('child process not found');
    }
};

export const end = async (syncId: string): Promise<Result<string>> => {
    const pid = childProcesses.get(syncId);
    if (pid) {
        process.kill(pid, 'SIGTERM');
        childProcesses.delete(syncId);
        return resultOk('ended');
    } else {
        return resultErr('child process not found');
    }
};
