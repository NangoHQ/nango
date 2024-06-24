import type { NangoAction, BackgroundCheckParameterResponse } from '../../models';

export default async function runAction(nango: NangoAction): Promise<BackgroundCheckParameterResponse> {
    const connection = await nango.getConnection();
    const accountHierarchyEnabled = connection.connection_config['accountHierarchyEnabled'] || false;

    let parameters = [
        { key: 'package', type: 'string', title: 'Service Key', description: 'Slug of the associated service_key.', required: true },
        { key: 'candidate_id', type: 'string', title: 'Candidate ID', description: 'Id of the candidate to trigger the background check for.', required: true },
        { key: 'tags', type: 'string[]', title: 'Tags', description: 'Array of tags for the report.', required: false },
        {
            key: 'country',
            type: 'string',
            title: 'Country',
            description: 'Country name of the user who is to undergo the background check. Example: U.S.',
            required: Boolean(accountHierarchyEnabled)
        },
        {
            key: 'state',
            type: 'string',
            title: 'State',
            description: 'State name of the user who is to undergo the background check. Required if in the U.S.',
            required: false
        },
        {
            key: 'city',
            type: 'string',
            title: 'City',
            description: 'City name of the user who is to undergo the background check. Required if in the U.S.',
            required: false
        }
    ];

    if (accountHierarchyEnabled) {
        parameters = [
            ...parameters,
            { key: 'node', type: 'string', title: 'Node', description: 'Tier of the node which is the custom_id of the node.', required: true }
        ];
    }

    return { parameters };
}
