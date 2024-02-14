import type { NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    return nango.get({ endpoint: '/customer/addressBook' });
}
