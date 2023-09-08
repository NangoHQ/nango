import type { NangoSync, HubspotUser } from './models';

interface Params {
    limit: string;
    [key: string]: any; // Allows additional properties such as the 'after' property
}

export default async function fetchData(nango: NangoSync) {
    const MAX_PAGE = 100;

    let page = 1;
    let afterLink = null;

    while (true) {
        let payload = {
            endpoint: '/settings/v3/users',
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

        const mappedUsers: HubspotUser[] = pageData.map((owner: HubspotUser) => ({
            id: owner.id,
            email: owner.email,
            roleId: owner.roleId,
            primaryTeamId: owner.primaryTeamId,
            superAdmin: owner.superAdmin
        }));

        if (mappedUsers.length > 0) {
            await nango.batchSave<HubspotUser>(mappedUsers, 'HubspotUser');
            await nango.log(`Sent ${mappedUsers.length} users`);
        }

        if (response.data.length == MAX_PAGE) {
            page += 1;
            afterLink = response.data.paging.next.after;
        } else {
            break;
        }
    }
}
