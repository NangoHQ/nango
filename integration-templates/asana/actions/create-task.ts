import type { NangoAction, AsanaTask, Task, CreateAsanaTask, NangoActionError } from '../../models';
// eslint-disable-next-line import/extensions
import { toTask } from '../mappers/to-task';

export default async function runAction(nango: NangoAction, input: CreateAsanaTask): Promise<Task> {
    if (!input.parent && !input.projects) {
        throw new nango.ActionError<NangoActionError>({
            type: 'validation_error',
            message:
                'You must specify one of workspace, parent or projects. For more information on API status codes and how to handle them, read the docs on errors: https://developers.asana.com/docs/errors'
        });
    }

    const response = await nango.post<{ data: AsanaTask }>({
        endpoint: '/api/1.0/tasks',
        data: {
            data: input
        }
    });

    const { data } = response;

    return toTask(data.data);
}
