import type { PipeDriveActivity, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/activities/collection';
        const config = {
            ...(nango.lastSyncDate ? { params: { since: nango.lastSyncDate?.toISOString() } } : {}),
            paginate: {
                type: 'cursor',
                cursor_path_in_response: 'additional_data.next_cursor',
                cursor_name_in_request: 'cursor',
                limit_name_in_request: 'limit',
                response_path: 'data',
                limit: 100
            }
        };
        for await (const activity of nango.paginate({ ...config, endpoint })) {
            const mappedActivity: PipeDriveActivity[] = activity.map(mapActivity) || [];
            // Save Activitiy
            const batchSize: number = mappedActivity.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} activities (total activities: ${totalRecords})`);
            await nango.batchSave(mappedActivity, 'PipeDriveActivity');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapActivity(activity: any): PipeDriveActivity {
    return {
        id: activity.id,
        done: activity.done,
        type: activity.type,
        duration: activity.duration,
        subject: activity.subject,
        company_id: activity.company_id,
        user_id: activity.user_id,
        conference_meeting_client: activity.conference_meeting_client,
        conference_meeting_url: activity.conference_meeting_url,
        conference_meeting_id: activity.conference_meeting_id,
        due_date: activity.due_date,
        due_time: activity.due_time,
        busy_flag: activity.busy_flag,
        add_time: activity.add_time,
        marked_as_done_time: activity.marked_as_done_time,
        public_description: activity.public_description,
        location: activity.location,
        org_id: activity.org_id,
        person_id: activity.person_id,
        deal_id: activity.deal_id,
        active_flag: activity.active_flag,
        update_time: activity.update_time,
        update_user_id: activity.update_user_id,
        source_timezone: activity.source_timezone,
        lead_id: activity.lead_id,
        location_subpremise: activity.location_subpremise,
        location_street_number: activity.location_street_number,
        location_route: activity.location_route,
        location_sublocality: activity.location_sublocality,
        location_locality: activity.location_locality,
        location_admin_area_level_1: activity.location_admin_area_level_1,
        location_admin_area_level_2: activity.location_admin_area_level_2,
        location_country: activity.location_country,
        location_postal_code: activity.location_postal_code,
        location_formatted_address: activity.location_formatted_address,
        project_id: activity.project_id
    };
}
