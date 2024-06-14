import type { NangoAction, Task, AsanaUpdateTask, AsanaTask, NangoActionError } from '../../models';
import { toTask } from '../mappers/to-task.js';

export default async function runAction(nango: NangoAction, input: AsanaUpdateTask): Promise<Task> {
    if (!input.id) {
        throw new nango.ActionError<NangoActionError>({
            type: 'validation_error',
            message: 'You must specify a task id (gid) to update.'
        });
    }

    const normalizedInput = normalizeDates(input);

    const response = await nango.put<{ data: AsanaTask }>({
        endpoint: `/api/1.0/tasks/${input.id}`,
        data: {
            data: normalizedInput
        }
    });

    const { data } = response;

    return toTask(data.data);
}

function normalizeDates(input: AsanaUpdateTask): AsanaUpdateTask {
    return {
        ...input,
        due_on: input.due_on ? new Date(input.due_on).toISOString() : undefined,
        due_at: input.due_at ? new Date(input.due_at).toISOString() : undefined
    };
}
