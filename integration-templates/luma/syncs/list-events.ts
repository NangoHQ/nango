import type { NangoSync, Event } from '../../models';
import type { LumaEvent } from '../types';
import { toEvent } from '../mappers/to-event.js';

/**
 * Fetches events from a specified endpoint and processes them for synchronization.
 * Uses pagination and retries for robust data retrieval and saving.
 * Convert LumaEvent to Event using mapping function.
 *
 * @param nango An instance of NangoSync for handling synchronization tasks.
 * @returns Promise that resolves when all events are fetched and saved.
 */
export default async function fetchData(nango: NangoSync): Promise<void> {
    const endpoint = '/public/v1/calendar/list-events';
    const config = {
        // Include 'after' parameter with the lastSyncDate if available
        ...(nango.lastSyncDate ? { params: { after: nango.lastSyncDate?.toISOString() } } : {}),
        paginate: {
            type: 'cursor',
            cursor_path_in_response: 'next_cursor',
            cursor_name_in_request: 'pagination_cursor',
            response_path: 'entries',
            limit_name_in_request: 'pagination_limit',
            limit: 100
        },
        retries: 10
    };

    for await (const events of nango.paginate<LumaEvent>({ ...config, endpoint })) {
        const formattedEvents = events.map((event: LumaEvent) => toEvent(event));
        await nango.batchSave<Event>(formattedEvents, 'Event');
    }
}
