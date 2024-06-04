import { taskStates } from '@nangohq/scheduler';
import type { Task } from '@nangohq/scheduler';
import { TaskAction, TaskWebhook, TaskPostConnection } from './types.js';
import { z } from 'zod';
import { actionArgsSchema, webhookArgsSchema, postConnectionArgsSchema } from '../routes/v1/postSchedule.js';
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
const postConnectionSchema = z.object({
    ...commonSchemaFields,
    payload: postConnectionArgsSchema
});

export function validateTask(task: Task): Result<TaskAction | TaskWebhook | TaskPostConnection> {
    const action = actionSchema.safeParse(task);
    if (action.success) {
        return Ok(
            TaskAction({
                state: action.data.state,
                id: action.data.id,
                name: action.data.name,
                actionName: action.data.payload.actionName,
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
                webhookName: webhook.data.payload.webhookName,
                parentSyncName: webhook.data.payload.parentSyncName,
                connection: webhook.data.payload.connection,
                activityLogId: webhook.data.payload.activityLogId,
                input: webhook.data.payload.input
            })
        );
    }
    const postConnection = postConnectionSchema.safeParse(task);
    if (postConnection.success) {
        return Ok(
            TaskPostConnection({
                id: postConnection.data.id,
                state: postConnection.data.state,
                name: postConnection.data.name,
                postConnectionName: postConnection.data.payload.postConnectionName,
                connection: postConnection.data.payload.connection,
                fileLocation: postConnection.data.payload.fileLocation,
                activityLogId: postConnection.data.payload.activityLogId
            })
        );
    }
    return Err(`Cannot validate task ${JSON.stringify(task)}: ${action.error || webhook.error || postConnection.error}`);
}
