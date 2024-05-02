import type { GreenhouseCandidate, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/candidates';
        const config = {
            ...(nango.lastSyncDate ? { params: { created_after: nango.lastSyncDate?.toISOString() } } : {}),
            paginate: {
                type: 'link',
                limit_name_in_request: 'per_page',
                link_rel_in_response_header: 'next',
                limit: 100
            }
        };
        for await (const candidate of nango.paginate({ ...config, endpoint })) {
            const mappedCandidate: GreenhouseCandidate[] = candidate.map(mapCandidate) || [];

            const batchSize: number = mappedCandidate.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} candidate(s) (total candidate(s): ${totalRecords})`);
            await nango.batchSave(mappedCandidate, 'GreenhouseCandidate');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapCandidate(candidate: any): GreenhouseCandidate {
    return {
        id: candidate.id,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        company: candidate.company,
        title: candidate.title,
        created_at: candidate.created_at,
        updated_at: candidate.updated_at,
        last_activity: candidate.last_activity,
        is_private: candidate.is_private,
        photo_url: candidate.photo_url,
        attachments: candidate.attachments,
        application_ids: candidate.application_ids,
        phone_numbers: candidate.phone_numbers,
        addresses: candidate.addresses,
        email_addresses: candidate.email_addresses,
        website_addresses: candidate.website_addresses,
        social_media_addresses: candidate.social_media_addresses,
        recruiter: candidate.recruiter,
        coordinator: candidate.coordinator,
        can_email: candidate.can_email,
        tags: candidate.tags,
        applications: candidate.applications,
        educations: candidate.educations,
        employments: candidate.employments,
        linked_user_ids: candidate.linked_user_ids,
        custom_fields: candidate.custom_fields,
        keyed_custom_fields: candidate.keyed_custom_fields
    };
}
