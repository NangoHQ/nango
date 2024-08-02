import type { SlackUser, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    // Fetch all users (paginated)
    let nextCursor = 'x';
    let responses: any[] = [];

    while (nextCursor !== '') {
        const response = await nango.get({
            endpoint: 'users.list',
            retries: 10,
            params: {
                limit: '200',
                cursor: nextCursor !== 'x' ? nextCursor : ''
            }
        });

        if (!response.data.ok) {
            await nango.log(`Received a Slack API error: ${JSON.stringify(response.data, null, 2)}`);
        }

        const { members, response_metadata } = response.data;
        responses = responses.concat(members);
        nextCursor = response_metadata.next_cursor;
    }

    // Transform users into our data model
    const users: SlackUser[] = responses.map((record: any) => {
        return {
            id: record.id,
            team_id: record.team_id,
            name: record.name,
            deleted: record.deleted,
            tz: record.tz,
            tz_label: record.tz_label,
            tz_offset: record.tz_offset,
            profile: {
                avatar_hash: record.profile.avatar_hash,
                real_name: record.profile.real_name ? record.profile.real_name : null,
                display_name: record.profile.display_name ? record.profile.display_name : null,
                real_name_normalized: record.profile.real_name_normalized ? record.profile.real_name_normalized : null,
                display_name_normalized: record.profile.display_name_normalized ? record.profile.display_name_normalized : null,
                email: record.profile.email ? record.profile.email : null,
                image_original: record.profile.is_custom_image ? record.profile.image_original : null
            },
            is_admin: record.is_admin,
            is_owner: record.is_owner,
            is_primary_owner: record.is_primary_owner,
            is_restricted: record.is_restricted,
            is_ultra_restricted: record.is_ultra_restricted,
            is_bot: record.is_bot,
            updated: record.updated,
            is_app_user: record.is_app_user,
            raw_json: JSON.stringify(record)
        };
    });

    await nango.batchSave(users, 'SlackUser');
}
