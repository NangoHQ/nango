import type { NangoAction, AlgoliaContact, AlgoliaCreateContactInput } from './models';

export default async function runAction(nango: NangoAction, input: AlgoliaCreateContactInput): Promise<AlgoliaContact> {
    const endpoint = `/1/indexes/contacts`;

    try {
        const postData = {
            name: input.name,
            company: input.company,
            email: input.email
        };
        const resp = await nango.post({
            endpoint: endpoint,
            data: postData
        });

        return {
            createdAt: resp.data.createdAt,
            taskID: resp.data.taskID,
            objectID: resp.data.objectID
        };
    } catch (error: any) {
        throw new nango.ActionError({
            message: `Error in runAction: ${error.message}`
        });
    }
}
