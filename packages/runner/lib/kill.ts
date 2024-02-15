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
