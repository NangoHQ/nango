import { logger } from './logger.js';
import { abortControllers, usage } from './state.js';

export const abort = (taskId: string): boolean => {
    const ac = abortControllers.get(taskId);
    if (ac) {
        ac.abort();
        abortControllers.delete(taskId);
        usage.untrackByTaskId(taskId);
        logger.info('Aborted task', { taskId });
        return true;
    } else {
        logger.error(`Error aborting task ${taskId}: task not found`);
        return false;
    }
};
