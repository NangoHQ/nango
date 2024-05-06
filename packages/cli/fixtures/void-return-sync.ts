import type { NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    await nango.get({
        endpoint: 'foo'
    });

    return;
}
