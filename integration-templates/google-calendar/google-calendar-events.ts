import type { NangoSync, GoogleCalendarEvent } from './models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    oneMonthAgo.setHours(0, 0, 0, 0);
    const timeMin = oneMonthAgo.toISOString();

    const maxResults = '100';

    const endpoint = `calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}`;

    for await (const eventPage of nango.paginate<GoogleCalendarEvent>({ endpoint, params: { maxResults } })) {
        await nango.batchSave<GoogleCalendarEvent>(eventPage, 'GoogleCalendarEvent');
    }
}
