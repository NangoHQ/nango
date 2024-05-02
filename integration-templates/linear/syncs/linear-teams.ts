import type { NangoSync, LinearTeam } from '../../models';

export default async function fetchData(nango: NangoSync) {
    const { lastSyncDate } = nango;
    const pageSize = 50;
    let after = '';

    while (true) {
        const filterParam = lastSyncDate
            ? `
        , filter: {
            updatedAt: { gte: "${lastSyncDate.toISOString()}" }
        }`
            : '';

        const afterParam = after ? `, after: "${after}"` : '';

        const query = `
        query {
            teams (first: ${pageSize}${afterParam}${filterParam}) {
                nodes {
                    id
                    name
                    description
                    createdAt
                    updatedAt
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }`;

        const response = await nango.post({
            baseUrlOverride: 'https://api.linear.app',
            endpoint: '/graphql',
            data: {
                query: query
            }
        });

        await nango.batchSave(mapTeams(response.data.data.teams.nodes), 'LinearTeam');

        if (!response.data.data.teams.pageInfo.hasNextPage || !response.data.data.teams.pageInfo.endCursor) {
            break;
        } else {
            after = response.data.data.teams.pageInfo.endCursor;
        }
    }
}

function mapTeams(records: any[]): LinearTeam[] {
    return records.map((record: any) => {
        return {
            id: record.id,
            name: record.name,
            description: record.description,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt)
        };
    });
}
