import type { NangoSync, GoogleCalendar } from './models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    let batch: GoogleCalendar[] = [];
    const batchSize = 100;
    const maxResults = batchSize.toString();

    for await (const eventPage of nango.paginate<GoogleCalendar>({ endpoint: 'calendar/v3/users/me/calendarList', params: { maxResults } })) {
        for (const event of eventPage) {
            batch.push(event);

            if (batch.length === batchSize) {
                await nango.batchSave<GoogleCalendar>(batch, 'GoogleCalendar');
            }
        }
    }

    if (batch.length > 0) {
        await nango.batchSave<GoogleCalendar>(batch, 'GoogleCalendar');
    }
}
