import type { WorkableCandidateActivity, NangoSync } from '../../models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const candidates: any[] = await getAllCandidates(nango);

        for (const candidate of candidates) {
            const endpoint = `/spi/v3/candidates/${candidate.id}/activities`;

            const config = {
                paginate: {
                    type: 'link',
                    link_path_in_response_body: 'paging.next',
                    limit_name_in_request: 'limit',
                    response_path: 'activities',
                    limit: LIMIT
                }
            };
            for await (const activity of nango.paginate({ ...config, endpoint })) {
                const mappedActivity: WorkableCandidateActivity[] = activity.map(mapActivity) || [];

                const batchSize: number = mappedActivity.length;
                totalRecords += batchSize;
                await nango.log(`Saving batch of ${batchSize} activitie(s) for candidate ${candidate.id} (total activitie(s): ${totalRecords})`);
                await nango.batchSave(mappedActivity, 'WorkableCandidateActivity');
            }
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

async function getAllCandidates(nango: NangoSync) {
    const records: any[] = [];
    const proxyConfig = {
        endpoint: '/spi/v3/candidates',
        paginate: {
            type: 'link',
            link_path_in_response_body: 'paging.next',
            limit_name_in_request: 'limit',
            response_path: 'candidates',
            limit: LIMIT
        }
    };

    for await (const recordBatch of nango.paginate(proxyConfig)) {
        records.push(...recordBatch);
    }

    return records;
}

function mapActivity(activity: any): WorkableCandidateActivity {
    return {
        id: activity.id,
        action: activity.action,
        stage_name: activity.stage_name,
        created_at: activity.created_at,
        body: activity.body,
        member: activity.member,
        rating: activity.rating
    };
}
