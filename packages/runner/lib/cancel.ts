import { Result, resultOk, resultErr } from '@nangohq/shared';
import { runningSyncsWithAborts } from './state.js';

export const cancel = (syncId: string): Result<string> => {
    const abortController = runningSyncsWithAborts.get(syncId);
    if (abortController) {
        abortController.abort();
        return resultOk('cancelled');
    } else {
        return resultErr('child process not found');
    }
};
