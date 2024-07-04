// Discards the timeZone data and assumes all dates returned are in UTC
export function parseDate(xeroDateString: string): Date {
    const match = xeroDateString.match(/\/Date\((\d+)([+-]\d{4})\)\//);
    if (match) {
        const timestamp = parseInt(match[1] as string, 10);

        // Create a new date object with the timestamp
        const date = new Date(timestamp);
        return date;
    }
    throw new Error(`Cannot parse date from Xero API with parseDate function, input was: ${xeroDateString}`);
}
