import type { NangoSync, GithubIssue } from './models';

export default async function fetchData(nango: NangoSync) {
    const repos: any[] = await getAll(nango, '/user/repos');

    for (let repo of repos) {
        for await (const issueBatch of nango.paginate({ endpoint: `/repos/${repo.owner.login}/${repo.name}/issues` })) {
            let issues: any[] = issueBatch.filter((issue) => !('pull_request' in issue));

            const mappedIssues: GithubIssue[] = issues.map((issue) => ({
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

async function getAll(nango: NangoSync, endpoint: string) {
    const records: any[] = [];

    for await (const recordBatch of nango.paginate({ endpoint })) {
        records.push(...recordBatch);
    }

    return records;
}
