import type { NangoSync, LinearProject } from '../../models';

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
            projects (first: ${pageSize}${afterParam}${filterParam}) {
                nodes {
                    id
                    name
                    url
                    description
                    teams {
                        nodes {
                            id
                        }
                    }
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

        await nango.batchSave(mapProjects(response.data.data.projects.nodes), 'LinearProject');

        if (!response.data.data.projects.pageInfo.hasNextPage || !response.data.data.projects.pageInfo.endCursor) {
            break;
        } else {
            after = response.data.data.projects.pageInfo.endCursor;
        }
    }
}

function mapProjects(records: any[]): LinearProject[] {
    return records.map((record: any) => {
        return {
            id: record.id,
            name: record.name,
            url: record.url,
            description: record.description,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
            teamId: record.teams.nodes[0]['id'] || ''
        };
    });
}
