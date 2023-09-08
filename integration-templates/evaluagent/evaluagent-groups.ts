import type { NangoSync, EvaluAgentGroup } from './models';

export default async function fetchData(nango: NangoSync) {
    let payload = {
        endpoint: '/v1/org/groups'
    };

    const response = await nango.get(payload);

    let returnedData = response.data.data;

    const mappedGroups: EvaluAgentGroup[] = returnedData.map((group: EvaluAgentGroup) => ({
        id: group.id,
        name: group.attributes.name,
        level: group.attributes.level,
        active: group.attributes.active,
        parent: group.attributes.parent,
        hasChildren: group.attributes.has_children,
        isCustomReportingGroup: group.attributes.is_custom_reporting_group
    }));

    if (mappedGroups.length > 0) {
        await nango.batchSave<EvaluAgentGroup>(mappedGroups, 'EvaluAgentGroup');
        await nango.log(`Sent ${mappedGroups.length} groups`);
    }
}
