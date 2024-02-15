import { Result, resultOk, resultErr } from '@nangohq/shared';
import { runningSyncs } from './state.js';

export const kill = (syncId: string): Result<string> => {
    const sync = runningSyncs.get(syncId);
    if (sync) {
        runningSyncs.set(syncId, { cancelled: true });
        return resultOk('cancelled');
    } else {
        return resultErr('child process not found');
    }
};
