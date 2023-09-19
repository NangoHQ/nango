import type { NangoSync, EvaluAgentRole } from './models';

export default async function fetchData(nango: NangoSync) {
    let payload = {
        endpoint: '/v1/org/roles'
    };

    const response = await nango.get(payload);

    let returnedData = response.data.data;

    const mappedRoles: EvaluAgentRole[] = returnedData.map((role: EvaluAgentRole) => ({
        id: role.id,
        title: role.attributes.title,
        name: role.attributes.name
    }));

    if (mappedRoles.length > 0) {
        await nango.batchSave<EvaluAgentRole>(mappedRoles, 'EvaluAgentRole');
        await nango.log(`Sent ${mappedRoles.length} roles`);
    }
}
