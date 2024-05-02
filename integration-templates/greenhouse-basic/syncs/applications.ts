import type { GreenhouseApplication, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/applications';
        const config = {
            ...(nango.lastSyncDate ? { params: { created_after: nango.lastSyncDate?.toISOString() } } : {}),
            paginate: {
                type: 'link',
                limit_name_in_request: 'per_page',
                link_rel_in_response_header: 'next',
                limit: 100
            }
        };
        for await (const application of nango.paginate({ ...config, endpoint })) {
            const mappedApplication: GreenhouseApplication[] = application.map(mapApplication) || [];

            const batchSize: number = mappedApplication.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} application(s) (total application(s): ${totalRecords})`);
            await nango.batchSave(mappedApplication, 'GreenhouseApplication');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapApplication(application: any): GreenhouseApplication {
    return {
        id: application.id,
        candidate_id: application.candidate_id,
        prospect: application.prospect,
        applied_at: application.applied_at,
        rejected_at: application.rejected_at,
        last_activity_at: application.last_activity_at,
        location: application.location,
        source: application.source,
        credited_to: application.credited_to,
        rejection_reason: application.rejection_reason,
        rejection_details: application.rejection_details,
        jobs: application.jobs,
        job_post_id: application.job_post_id,
        status: application.status,
        current_stage: application.current_stage,
        answers: application.answers,
        prospective_office: application.prospective_office,
        prospective_department: application.prospective_department,
        prospect_detail: application.prospect_detail,
        custom_fields: application.custom_fields,
        keyed_custom_fields: application.keyed_custom_fields,
        attachments: application.attachments
    };
}
