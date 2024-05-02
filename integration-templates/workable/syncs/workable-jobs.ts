import type { WorkableJob, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/spi/v3/jobs';
        const config = {
            ...(nango.lastSyncDate ? { params: { created_after: nango.lastSyncDate?.toISOString() } } : {}),
            paginate: {
                type: 'link',
                link_path_in_response_body: 'paging.next',
                limit_name_in_request: 'limit',
                response_path: 'jobs',
                limit: 100
            }
        };
        for await (const job of nango.paginate({ ...config, endpoint })) {
            const mappedJob: WorkableJob[] = job.map(mapJob) || [];

            const batchSize: number = mappedJob.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} jobs (total jobs: ${totalRecords})`);
            await nango.batchSave(mappedJob, 'WorkableJob');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapJob(job: any): WorkableJob {
    return {
        id: job.id,
        title: job.title,
        full_title: job.full_title,
        shortcode: job.shortcode,
        code: job.code,
        state: job.state,
        sample: job.sample,
        department: job.department,
        department_hierarchy: job.department_hierarchy,
        url: job.url,
        application_url: job.application_url,
        shortlink: job.shortlink,
        location: job.location,
        locations: job.locations,
        salary: job.salary,
        created_at: job.created_at
    };
}
