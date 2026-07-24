import type { NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    await nango.trackDeletesStart('ModelA');
    await nango.batchSave([{ id: '1' }], 'ModelA');
    await nango.trackDeletesEnd('ModelA');

    await nango.trackDeletesStart('ModelB');
    await nango.batchSave([{ id: '2' }], 'ModelB');
    await nango.trackDeletesEnd('ModelB');
}
