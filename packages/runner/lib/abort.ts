import { abortControllers } from './state.js';
import { logger } from './utils.js';

export const abort = (taskId: string): boolean => {
    const ac = abortControllers.get(taskId);
    if (ac) {
        ac.abort();
        logger.info('Aborted task', { taskId });
        return true;
    } else {
        logger.error(`Error aborting task ${taskId}: task not found`);
        return false;
    }
};
