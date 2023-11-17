import type { NangoSync, GithubIssue } from './models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    const repos: any[] = await getAllRepositories(nango);

    for (const repo of repos) {
        const proxyConfig = {
            endpoint: `/repos/${repo.owner.login}/${repo.name}/issues`,
            paginate: {
                limit: LIMIT
            }
        };
        for await (const issueBatch of nango.paginate(proxyConfig)) {
            const issues: any[] = issueBatch.filter((issue: any) => !('pull_request' in issue));

            const mappedIssues: GithubIssue[] = issues.map((issue: any) => ({
                id: issue.id,
                owner: repo.owner.login,
                repo: repo.name,
                issue_number: issue.number,
                title: issue.title,
                state: issue.state,
                author: issue.user.login,
                author_id: issue.user.id,
                body: issue.body,
                date_created: issue.created_at,
                date_last_modified: issue.updated_at
            }));

            if (mappedIssues.length > 0) {
                await nango.batchSave(mappedIssues, 'GithubIssue');
                await nango.log(`Sent ${mappedIssues.length} issues from ${repo.owner.login}/${repo.name}`);
            }
        }
    }
}

async function getAllRepositories(nango: NangoSync) {
    const records: any[] = [];
    const proxyConfig = {
        endpoint: '/user/repos',
        paginate: {
            limit: LIMIT
        }
    };

    for await (const recordBatch of nango.paginate(proxyConfig)) {
        records.push(...recordBatch);
    }

    return records;
}
