import { logger } from './logger.js';
import { abortControllers } from './state.js';

import type { RunnerMonitor } from './monitor.js';

export const abort = (taskId: string, usage: RunnerMonitor): boolean => {
    const ac = abortControllers.get(taskId);
    if (ac) {
        ac.abort();
        abortControllers.delete(taskId);
        usage.untrack(taskId);
        logger.info('Aborted task', { taskId });
        return true;
    } else {
        logger.error(`Error aborting task ${taskId}: task not found`);
        return false;
    }
};
