import { Ok, Err } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { syncAbortControllers } from './state.js';

export const cancel = (syncId: string): Result<string> => {
    const abortController = syncAbortControllers.get(syncId);
    if (abortController) {
        abortController.abort();
        return Ok('cancelled');
    } else {
        return Err('child process not found');
    }
};
