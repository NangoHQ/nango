/**
 * Converts a date string to a formatted date string in the 'YYYY-MM-DD' format.
 *
 * @param {string} dateStr - The input date string to be converted. Should be a valid date string format.
 * @returns {string} - The formatted date string in 'YYYY-MM-DD' format.
 */
export function toDate(dateStr: string): string {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}
