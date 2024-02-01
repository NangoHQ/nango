import type { HubspotUser, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/settings/v3/users';
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
        for await (const user of nango.paginate({ ...config, endpoint })) {
            const mappedUser: HubspotUser[] = user.map(mapUser) || [];

            const batchSize: number = mappedUser.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} users (total users: ${totalRecords})`);
            await nango.batchSave(mappedUser, 'HubspotUser');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapUser(user: any): HubspotUser {
    return {
        id: user.id,
        email: user.email,
        roleId: user.roleId,
        primaryTeamId: user.primaryTeamId,
        superAdmin: user.superAdmin
    };
}
