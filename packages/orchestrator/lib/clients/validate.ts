import { taskStates } from '@nangohq/scheduler';
import type { Task } from '@nangohq/scheduler';
import { TaskAction, TaskWebhook } from './types.js';
import { z } from 'zod';
import { actionArgsSchema, webhookArgsSchema } from '../routes/v1/schedule.js';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

const commonSchemaFields = {
    id: z.string().uuid(),
    name: z.string().min(1),
    groupKey: z.string().min(1),
    state: z.enum(taskStates)
};
const actionSchema = z.object({
    ...commonSchemaFields,
    payload: actionArgsSchema
});
const webhookSchema = z.object({
    ...commonSchemaFields,
    payload: webhookArgsSchema
});

export function validateTask(task: Task): Result<TaskAction | TaskWebhook> {
    const action = actionSchema.safeParse(task);
    if (action.success) {
        return Ok(
            TaskAction({
                state: action.data.state,
                id: action.data.id,
                name: action.data.name,
                connection: action.data.payload.connection,
                activityLogId: action.data.payload.activityLogId,
                input: action.data.payload.input
            })
        );
    }
    const webhook = webhookSchema.safeParse(task);
    if (webhook.success) {
        return Ok(
            TaskWebhook({
                id: webhook.data.id,
                state: webhook.data.state,
                name: webhook.data.name,
                parentSyncName: webhook.data.payload.parentSyncName,
                connection: webhook.data.payload.connection,
                activityLogId: webhook.data.payload.activityLogId,
                input: webhook.data.payload.input
            })
        );
    }
    return Err(`Cannot validate task: ${task}`);
}
