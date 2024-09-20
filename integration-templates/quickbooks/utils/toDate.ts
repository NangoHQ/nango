/**
 * Converts a date string to a formatted date string in the 'YYYY-MM-DD' format.
 *
 * @param {string} dateStr - The input date string to be converted. Should be a valid date string format.
 * @returns {string} - The formatted date string in 'YYYY-MM-DD' format.
 * @throws {Error} - If the date string is invalid or conversion fails.
 */
export function toDate(dateStr: string): string {
    const date = new Date(dateStr);

    if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
    }

    const formattedDate = date.toISOString().split('T')[0];

    if (formattedDate === undefined) {
        throw new Error('Date formatting failed');
    }

    return formattedDate;
}
