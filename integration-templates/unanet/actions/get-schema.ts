import type { NangoAction, Entity, Schema } from '../../models';

export default async function runAction(nango: NangoAction, input: Entity): Promise<Schema[]> {
    if (!input?.name) {
        throw new nango.ActionError({
            message: 'Name is required to look up an entity schema',
            code: 'missing_name'
        });
    }

    const response = await nango.get<Schema[]>({
        endpoint: `/api/${input.name}/schema`
    });

    const { data } = response;

    return data;
}
