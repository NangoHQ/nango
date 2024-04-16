import { resultOk, resultErr, type Result } from '@nangohq/utils';
import { syncAbortControllers } from './state.js';

export const cancel = (syncId: string): Result<string> => {
    const abortController = syncAbortControllers.get(syncId);
    if (abortController) {
        abortController.abort();
        return resultOk('cancelled');
    } else {
        return resultErr('child process not found');
    }
};
