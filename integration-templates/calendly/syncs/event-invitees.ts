import type { NangoSync, EventInvitee } from '../../models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const connection = await nango.getConnection();

    const userId = connection.connection_config['owner'];

    if (!userId) {
        throw new Error('No user id found');
    }

    for await (const eventResponse of nango.paginate({
        endpoint: '/scheduled_events',
        params: {
            user: userId
        },
        paginate: {
            response_path: 'collection'
        },
        retries: 10
    })) {
        for (const event of eventResponse) {
            const eventUri = event.uri;
            const segments = eventUri.split('/');
            const uuid = segments.pop();
            for await (const eventInviteeResponse of nango.paginate({
                endpoint: `/scheduled_events/${uuid}/invitees`,
                paginate: {
                    response_path: 'collection'
                }
            })) {
                const invitees = eventInviteeResponse.map((invitee) => {
                    return {
                        ...invitee,
                        id: invitee.uri.split('/').pop()
                    };
                });

                await nango.batchSave<EventInvitee>(invitees, 'EventInvitee');
            }
        }
    }
}
