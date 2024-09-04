import type { NangoSync, Event } from '../../models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    for await (const eventResponse of nango.paginate<Event[]>({
        endpoint: '/bookings',
        params: {
            ['filters[status]']: 'upcoming'
        },
        paginate: {
            response_path: 'data.bookings'
        },
        retries: 10
    })) {
        await nango.batchSave<Event[]>(eventResponse, 'Event');
    }
}
