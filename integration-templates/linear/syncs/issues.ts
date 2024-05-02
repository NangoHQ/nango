import type { NangoSync, LinearIssue } from '../../models';

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
            issues (first: ${pageSize}${afterParam}${filterParam}) {
                nodes {
                    assignee {
                        id
                        email
                        displayName
                        avatarUrl
                        name
                    }
                    createdAt
                    updatedAt
                    creator {
                        id
                        email
                        displayName
                        avatarUrl
                        name
                    }
                    description
                    dueDate
                    id
                    project {
                        id
                    }
                    team {
                        id
                    }
                    title
                    state {
                        description
                        id
                        name
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

        await nango.batchSave(mapIssues(response.data.data.issues.nodes), 'LinearIssue');

        if (!response.data.data.issues.pageInfo.hasNextPage || !response.data.data.issues.pageInfo.endCursor) {
            break;
        } else {
            after = response.data.data.issues.pageInfo.endCursor;
        }
    }
}

function mapIssues(records: any[]): LinearIssue[] {
    return records.map((record: any) => {
        return {
            id: record.id,
            assigneeId: record.assignee?.id ? record.assignee.id : null,
            creatorId: record.creator?.id ? record.creator.id : null,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
            description: record.description,
            dueDate: record.dueDate ? new Date(record.dueDate) : null,
            projectId: record.project?.id ? record.project.id : null,
            teamId: record.team.id,
            title: record.title,
            status: record.state.name
        };
    });
}
