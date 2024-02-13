import type { HubspotOwner, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/crm/v3/owners';
        const config = {
            paginate: {
                type: 'cursor',
                cursor_path_in_response: 'paging.next.after',
                limit_name_in_request: 'limit',
                cursor_name_in_request: 'after',
                response_path: 'results',
                limit: 100
            }
        };
        for await (const owner of nango.paginate({ ...config, endpoint })) {
            const mappedOwner: HubspotOwner[] = owner.map(mapOwner) || [];

            const batchSize: number = mappedOwner.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} owners (total owners: ${totalRecords})`);
            await nango.batchSave(mappedOwner, 'HubspotOwner');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapOwner(owner: any): HubspotOwner {
    return {
        id: owner.id,
        email: owner.email,
        firstName: owner.firstName,
        lastName: owner.lastName,
        userId: owner.userId,
        createdAt: owner.createdAt,
        updatedAt: owner.updatedAt,
        archived: owner.archived
    };
}
