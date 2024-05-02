import type { WorkableMember, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/spi/v3/members';
        const config = {
            paginate: {
                type: 'link',
                link_path_in_response_body: 'paging.next',
                limit_name_in_request: 'limit',
                response_path: 'members',
                limit: 100
            }
        };
        for await (const member of nango.paginate({ ...config, endpoint })) {
            const mappedMember: WorkableMember[] = member.map(mapMember) || [];

            const batchSize: number = mappedMember.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} members (total members: ${totalRecords})`);
            await nango.batchSave(mappedMember, 'WorkableMember');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapMember(member: any): WorkableMember {
    return {
        id: member.id,
        name: member.name,
        headline: member.headline,
        email: member.email,
        role: member.role
    };
}
