import type { NangoAction, Id, NangoActionError } from '../../models';

export default async function runAction(nango: NangoAction, input: Id): Promise<boolean> {
    if (!input.id) {
        throw new nango.ActionError<NangoActionError>({
            type: 'validation_error',
            message: 'You must specify a task id (gid) to delete.'
        });
    }
    const response = await nango.delete({
        endpoint: `/api/1.0/tasks/${input.id}`
    });

    return response.status === 200;
}
