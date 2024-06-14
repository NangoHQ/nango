import type { NangoAction, BaseAsanaModel, Limit } from '../../models';

export default async function runAction(nango: NangoAction, input: Limit): Promise<BaseAsanaModel[]> {
    const limit = input?.limit || 10;

    const response = await nango.get({
        endpoint: '/api/1.0/workspaces',
        params: {
            opt_fields: 'is_organization',
            limit
        }
    });

    return response.data.data;
}
