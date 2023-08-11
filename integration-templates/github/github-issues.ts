import type { NangoSync, GithubIssue } from './models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const repos = await paginate(nango, '/user/repos');

    for (let repo of repos) {
        let issues = await paginate(nango, `/repos/${repo.owner.login}/${repo.name}/issues`);

        // Filter out pull requests
        issues = issues.filter((issue) => !('pull_request' in issue));

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

async function paginate(nango: NangoSync, endpoint: string) {
    const MAX_PAGE = 100;

    let results: any[] = [];
    let page = 1;
    while (true) {
        const resp = await nango.get({
            endpoint: endpoint,
            params: {
                limit: `${MAX_PAGE}`,
                page: `${page}`
            }
        });

        results = results.concat(resp.data);

        if (resp.data.length == MAX_PAGE) {
            page += 1;
        } else {
            break;
        }
    }

    return results;
}
