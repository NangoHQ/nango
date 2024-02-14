import { Result, resultOk, resultErr } from '@nangohq/shared';
import { childProcesses } from './state.js';

export const kill = (syncId: string): Result<string> => {
    const child = childProcesses.get(syncId);
    if (child) {
        child.kill();
        childProcesses.delete(syncId);
        return resultOk('cancelled');
    } else {
        return resultErr('child process not found');
    }
};
