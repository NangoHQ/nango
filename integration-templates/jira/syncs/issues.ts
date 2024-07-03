import type { NangoSync, JiraIssue } from '../../models';

export default async function fetchData(nango: NangoSync) {
    const jql = nango.lastSyncDate ? `updated >= "${nango.lastSyncDate?.toISOString().slice(0, -8).replace('T', ' ')}"` : '';
    let startAt: number = 0;
    const maxResults: number = 50;
    const fields = 'id,key,summary,description,issuetype,status,assignee,reporter,project,created,updated';
    const cloudId = await getCloudId(nango);

    while (true) {
        const response = await nango.get({
            baseUrlOverride: 'https://api.atlassian.com',
            endpoint: `ex/jira/${cloudId}/rest/api/3/search`,
            params: {
                jql: jql,
                startAt: `${startAt}`,
                maxResults: `${maxResults}`,
                fields: fields
            },
            headers: {
                'X-Atlassian-Token': 'no-check'
            },
            retries: 10 // Exponential backoff + long-running job = handles rate limits well.
        });

        const issues = response.data.issues;
        await nango.batchSave(mapIssues(issues), 'JiraIssue');

        if (issues.length < maxResults) {
            break;
        } else {
            startAt += maxResults;
        }
    }
}

async function getCloudId(nango: NangoSync): Promise<string> {
    const connection = await nango.getConnection();

    if (connection.connection_config.cloud_id) {
        return connection.connection_config.cloud_id;
    }

    const response = await nango.get({
        baseUrlOverride: 'https://api.atlassian.com',
        endpoint: `oauth/token/accessible-resources`,
        retries: 10 // Exponential backoff + long-running job = handles rate limits well.
    });
    return response.data[0].id;
}

function mapIssues(records: any[]): JiraIssue[] {
    return records.map((record: any) => ({
        id: record.id,
        key: record.key,
        summary: record.fields.summary,
        issueType: record.fields.issuetype.name,
        status: record.fields.status.name,
        url: record.self,
        assignee: record.fields.assignee ? record.fields.assignee.emailAddress : null,
        projectKey: record.fields.project.key,
        projectName: record.fields.project.name,
        createdAt: new Date(record.fields.created),
        updatedAt: new Date(record.fields.updated)
    }));
}
