import * as activityService from '../../services/activity/activity.service.js';
import type { ActivityLog } from '../../models/Activity';

export const createActivityLogSeed = async (environmentId: number): Promise<number> => {
    const log = {
        level: 'info',
        success: true,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        environment_id: environmentId,
        operation_name: 'test'
    };
    const activityLogId = await activityService.createActivityLog(log as ActivityLog);

    return activityLogId as number;
};
