import * as activityService from '../../services/activity/activity.service.js';
import type { ActivityLog } from '../../models/Activity.js';
import { getOperationContext } from '@nangohq/logs';

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
    await getOperationContext(
        { id: String(activityLogId), operation: { type: 'sync', action: 'init' }, message: 'test' },
        { account: { id: 1, name: '' }, environment: { id: environmentId } }
    );

    return activityLogId as number;
};
