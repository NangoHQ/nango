import type { InternalNango as Nango } from './connection.manager.js';

export default async function execute(nango: Nango) {
    const response = await nango.proxy({ endpoint: '/account-info/v3/details' });

    if (!response || !response.data || !response.data.portalId) {
        return;
    }
    const portalId = response.data.portalId;

    await nango.updateConnectionConfig({ portalId });
}
