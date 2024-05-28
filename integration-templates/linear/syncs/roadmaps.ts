import type { NangoSync, LinearRoadmap } from '../../models';

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
            roadmaps (first: ${pageSize}${afterParam}${filterParam}) {
                nodes {
                    id
                    name
                    description
                    createdAt
                    updatedAt
                    projects {
                        nodes {
                            id
                        }
                    }
                    organization {
                        teams {
                            nodes {
                                id
                            }
                        }
                    }
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

        await nango.batchSave(mapRoadmaps(response.data.data.roadmaps.nodes), 'LinearRoadmap');

        if (!response.data.data.roadmaps.pageInfo.hasNextPage || !response.data.data.roadmaps.pageInfo.endCursor) {
            break;
        } else {
            after = response.data.data.roadmaps.pageInfo.endCursor;
        }
    }
}

function mapRoadmaps(records: any[]): LinearRoadmap[] {
    return records.map((record: any) => {
        return {
            id: record.id,
            name: record.name,
            description: record.description,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
            teamId: record.organization.teams.nodes[0]['id'] || '',
            projectIds: record.projects.nodes.map((project: any) => project.id).join(',')
        };
    });
}
