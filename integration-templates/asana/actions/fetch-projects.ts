import type { NangoAction, BaseAsanaModel, AsanaProjectInput } from '../../models';

export default async function runAction(nango: NangoAction, input: AsanaProjectInput): Promise<BaseAsanaModel[]> {
    const limit = input.limit || 10;
    const workspace = input.workspace;
    const response = await nango.get({
        endpoint: '/api/1.0/projects',
        params: {
            limit,
            workspace
        }
    });

    return response.data.data;
}
