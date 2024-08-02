import type { NangoSync, EventType } from '../../models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const connection = await nango.getConnection();

    const userId = connection.connection_config['owner'];

    if (!userId) {
        throw new Error('No user id found');
    }

    for await (const eventTypes of nango.paginate({
        endpoint: '/event_types',
        params: {
            user: userId
        },
        paginate: {
            response_path: 'collection'
        },
        retries: 10
    })) {
        const eventTypeData = eventTypes.map((eventType) => {
            return {
                ...eventType,
                id: eventType.uri.split('/').pop()
            };
        });

        await nango.batchSave<EventType>(eventTypeData, 'EventType');
    }
}
