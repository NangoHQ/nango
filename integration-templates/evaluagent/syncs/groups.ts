import type { NangoSync, EvaluAgentGroup } from '../../models';

interface EvaluAgentGroupResponseCustom {
    is_custom_reporting_group: boolean;
    has_children: boolean;
}

interface EvaluAgentGroupResponse {
    id: string;
    attributes: EvaluAgentGroup & EvaluAgentGroupResponseCustom;
}

export default async function fetchData(nango: NangoSync) {
    const payload = {
        endpoint: '/v1/org/groups'
    };

    const response = await nango.get(payload);

    const returnedData = response.data.data;

    const mappedGroups: EvaluAgentGroup[] = returnedData.map((group: EvaluAgentGroupResponse) => ({
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
