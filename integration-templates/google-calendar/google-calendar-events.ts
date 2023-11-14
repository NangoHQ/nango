import type { NangoSync, GoogleCalendarEvent } from './models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    oneMonthAgo.setHours(0, 0, 0, 0);
    const timeMin = oneMonthAgo.toISOString();

    let batch: GoogleCalendarEvent[] = [];
    const batchSize = 100;
    const maxResults = batchSize.toString();

    const endpoint = `calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}`;

    for await (const eventPage of nango.paginate<GoogleCalendarEvent>({ endpoint, params: { maxResults } })) {
        for (const event of eventPage) {
            batch.push(event);

            if (batch.length === batchSize) {
                await nango.batchSave<GoogleCalendarEvent>(batch, 'GoogleCalendarEvent');
            }
        }
    }

    if (batch.length > 0) {
        await nango.batchSave<GoogleCalendarEvent>(batch, 'GoogleCalendarEvent');
    }
}
