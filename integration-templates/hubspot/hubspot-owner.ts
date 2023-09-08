import type { NangoSync, HubspotOwner } from './models';

interface Params {
    limit: string;
    [key: string]: any; // Allows additional properties
}

export default async function fetchData(nango: NangoSync) {
    const MAX_PAGE = 100;

    let page = 1;
    let afterLink = null;

    while (true) {
        let payload = {
            endpoint: '/crm/v3/owners',
            params: {
                limit: `${MAX_PAGE}`
            } as Params
        };

        if (!afterLink) {
            // If there is no afterLink, then we are on the first page.
            payload.params['after'] = afterLink;
        }

        const response = await nango.get(payload);

        let pageData = response.data.results;

        const mappedOwners: HubspotOwner[] = pageData.map((owner: HubspotOwner) => ({
            id: owner.id,
            email: owner.email,
            firstName: owner.firstName,
            lastName: owner.lastName,
            userId: owner.userId,
            createdAt: owner.createdAt,
            updatedAt: owner.updatedAt,
            archived: owner.archived
        }));

        if (mappedOwners.length > 0) {
            await nango.batchSave<HubspotOwner>(mappedOwners, 'HubspotOwner');
            await nango.log(`Sent ${mappedOwners.length} owners`);
        }

        if (response.data.length == MAX_PAGE) {
            page += 1;
            afterLink = response.data.paging.next.after;
        } else {
            break;
        }
    }
}
