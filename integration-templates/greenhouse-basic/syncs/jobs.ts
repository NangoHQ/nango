import type { GreenhouseJob, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/jobs';
        const config = {
            ...(nango.lastSyncDate ? { params: { created_after: nango.lastSyncDate?.toISOString() } } : {}),
            paginate: {
                type: 'link',
                limit_name_in_request: 'per_page',
                link_rel_in_response_header: 'next',
                limit: 100
            }
        };
        for await (const job of nango.paginate({ ...config, endpoint })) {
            const mappedJob: GreenhouseJob[] = job.map(mapJob) || [];

            const batchSize: number = mappedJob.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} job(s) (total job(s): ${totalRecords})`);
            await nango.batchSave(mappedJob, 'GreenhouseJob');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapJob(job: any): GreenhouseJob {
    return {
        id: job.id,
        name: job.name,
        requisition_id: job.requisition_id,
        notes: job.notes,
        confidential: job.confidential,
        status: job.status,
        created_at: job.created_at,
        opened_at: job.opened_at,
        closed_at: job.closed_at,
        updated_at: job.updated_at,
        is_template: job.is_template,
        copied_from_id: job.copied_from_id,
        departments: job.departments,
        offices: job.offices,
        custom_fields: job.custom_fields,
        keyed_custom_fields: job.keyed_custom_fields,
        hiring_team: job.hiring_team,
        openings: job.openings
    };
}
