import type { NangoSync, EventType } from '../../models';
import type { EventTypeResponse } from '../types';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const response = await nango.get<EventTypeResponse>({
        endpoint: '/event-types',
        retries: 10
    });

    const { data } = response.data;
    const { eventTypeGroups } = data;
    const eventTypes: EventType[] = [];
    for (const group of eventTypeGroups) {
        eventTypes.push(...group.eventTypes);
    }

    if (eventTypes.length) {
        await nango.batchSave<EventType>(eventTypes, 'EventType');
    }
}
