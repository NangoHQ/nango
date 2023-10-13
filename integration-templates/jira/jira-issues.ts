import type { NangoSync, JiraIssue } from './models';

export default async function fetchData(nango: NangoSync) {
    const jql = nango.lastSyncDate ? `updated >= "${nango.lastSyncDate?.toISOString().slice(0, -8).replace('T', ' ')}"` : '';
    const fields = 'id,key,summary,description,issuetype,status,assignee,reporter,project,created,updated';
    const cloudId = await getCloudId(nango);

    const proxyConfig = {
        baseUrlOverride: `https://api.atlassian.com/ex/jira/${cloudId}`,
        endpoint: `/rest/api/3/search`,
        paginate: {
            type: 'offset',
            offset_parameter_name: 'startAt',
            limit_parameter_name: 'maxResults',
            response_data_path: 'issues'
        },
        params: {
            jql: jql,
            fields: fields
        },
        headers: {
            'X-Atlassian-Token': 'no-check'
        },
        retries: 10 // Exponential backoff + long-running job = handles rate limits well.
    };

    for await (const issueBatch of nango.paginate(proxyConfig)) {
        await nango.batchSave(mapIssues(issueBatch), 'JiraIssue');
    }
}

async function getCloudId(nango: NangoSync): Promise<string> {
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
