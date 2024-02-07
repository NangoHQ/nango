import type { InternalNango as Nango } from './connection.manager.js';

export default async function execute(nango: Nango) {
    const query = `
        query {
            organization {
                id
            }
        }`;

    const response = await nango.proxy({
        endpoint: '/graphql',
        data: { query },
        method: 'POST'
    });

    if (!response || !response.data || !response.data.data?.organization?.id) {
        return;
    }

    const organizationId = response.data.data.organization.id;

    await nango.updateConnectionConfig({ organizationId });
}
