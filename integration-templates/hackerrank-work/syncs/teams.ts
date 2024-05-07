import type { HackerRankWorkTeam, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/x/api/v3/teams';
        const config = {
            paginate: {
                type: 'link',
                limit_name_in_request: 'limit',
                link_path_in_response_body: 'next',
                response_path: 'data',
                limit: 100
            }
        };

        const lastSyncDate = nango.lastSyncDate;
        for await (const team of nango.paginate({ ...config, endpoint })) {
            const teamsToSave = [];
            for (const item of team) {
                if (lastSyncDate !== undefined && new Date(item.created_at) < lastSyncDate) {
                    continue; // Skip teams created before lastSyncDate
                }
                const mappedTeam: HackerRankWorkTeam = mapTeam(item);

                totalRecords++;
                teamsToSave.push(mappedTeam);
            }

            if (teamsToSave.length > 0) {
                await nango.batchSave(teamsToSave, 'HackerRankWorkTeam');
                await nango.log(`Saving batch of ${teamsToSave.length} team(s) (total team(s): ${totalRecords})`);
            }
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapTeam(team: any): HackerRankWorkTeam {
    return {
        id: team.id,
        name: team.name,
        created_at: team.created_at,
        owner: team.owner,
        recruiter_count: team.recruiter_count,
        developer_count: team.developer_count,
        interviewer_count: team.interviewer_count,
        recruiter_cap: team.recruiter_cap,
        developer_cap: team.developer_cap,
        interviewer_cap: team.interviewer_cap,
        logo_id: team.logo_id,
        library_access: team.library_access,
        invite_as: team.invite_as,
        locations: team.locations,
        departments: team.departments
    };
}
