import type { NangoSync, Issue } from './models';

export default async function fetchData(nango: NangoSync) {
    const MAX_ISSUES = 15;
    const reposResponse = await nango.get({
        endpoint: '/user/repos'
    });
    const repos = reposResponse.data;

    for (const repo of repos) {
        const issuesResponse = await nango.get({
            endpoint: `/repos/${repo.owner.login}/${repo.name}/issues`,
            params: {
                per_page: MAX_ISSUES.toString()
            }
        });

        let issues = issuesResponse.data;

        issues = issues.filter((issue: any) => !('pull_request' in issue));

        const mappedIssues: Issue[] = issues.map((issue: any) => ({
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
            await nango.batchSave(mappedIssues, 'Issue');
            await nango.log(`Sent ${mappedIssues.length} issues from ${repo.owner.login}/${repo.name}`);
        }
    }
}
