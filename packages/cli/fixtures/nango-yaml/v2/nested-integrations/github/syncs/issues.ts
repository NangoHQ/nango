import type { NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    await nango.log('Fetching issues...');
}
