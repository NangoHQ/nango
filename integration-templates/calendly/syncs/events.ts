import type { NangoSync, Event } from '../../models';

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
        }
    })) {
        const events: Event[] = [];
        const cancelledEvents: Event[] = [];
        for (const event of eventResponse) {
            if (event.status === 'canceled') {
                cancelledEvents.push({
                    ...event,
                    id: event.uri.split('/').pop()
                });
            } else {
                events.push({
                    ...event,
                    id: event.uri.split('/').pop()
                });
            }
        }

        if (cancelledEvents.length > 0) {
            await nango.batchDelete<Event>(cancelledEvents, 'Event');
        }

        if (events.length > 0) {
            await nango.batchSave<Event>(events, 'Event');
        }
    }
}
