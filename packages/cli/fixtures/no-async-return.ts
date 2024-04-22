import type { NangoSync } from './models';

export default async function fetchAddress(nango: NangoSync) {
    return nango.get({ endpoint: '/customer/addressBook' });
}
