import type { NangoSync } from '../../models.js';

export default async function fetchData(nango: NangoSync): Promise<void> {
    await nango.log('Fetching contacts...');
}
